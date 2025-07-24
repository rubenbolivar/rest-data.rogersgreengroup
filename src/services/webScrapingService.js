const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const winston = require('winston');
const emailValidator = require('email-validator');

class WebScrapingService {
    constructor() {
        this.browser = null;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        ];

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'logs/web-scraping.log' })
            ]
        });

        // Rate limiting and retry configuration
        this.requestDelay = 2000; // 2 seconds between requests
        this.maxRetries = 3;
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Initialize browser for web scraping
     */
    async initBrowser() {
        if (this.browser) return;

        try {
            this.browser = await puppeteer.launch({
                headless: process.env.PUPPETEER_HEADLESS !== 'false',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            });

            this.logger.info('Browser initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize browser', { error: error.message });
            throw error;
        }
    }

    /**
     * Close browser
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.logger.info('Browser closed');
        }
    }

    /**
     * Extract email from restaurant website
     */
    async extractEmailFromWebsite(restaurant) {
        if (!restaurant.website) {
            return { email: null, method: 'no_website' };
        }

        const methods = [
            () => this.scrapeWithAxios(restaurant.website),
            () => this.scrapeWithPuppeteer(restaurant.website),
            () => this.searchContactPage(restaurant.website)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                const result = await methods[i]();
                if (result.email) {
                    this.logger.info('Email found', {
                        restaurantName: restaurant.name,
                        website: restaurant.website,
                        email: result.email,
                        method: result.method
                    });
                    return result;
                }
            } catch (error) {
                this.logger.warn(`Scraping method ${i + 1} failed`, {
                    website: restaurant.website,
                    error: error.message
                });
            }
        }

        return { email: null, method: 'not_found' };
    }

    /**
     * Scrape website using Axios (faster, but limited)
     */
    async scrapeWithAxios(url) {
        try {
            const response = await axios.get(url, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive'
                },
                maxRedirects: 5
            });

            const emails = this.extractEmailsFromText(response.data);
            const bestEmail = this.selectBestEmail(emails, url);

            return {
                email: bestEmail,
                method: 'axios',
                totalFound: emails.length
            };

        } catch (error) {
            if (error.response?.status === 403 || error.response?.status === 429) {
                throw new Error('Access denied or rate limited');
            }
            throw error;
        }
    }

    /**
     * Scrape website using Puppeteer (slower, but more capable)
     */
    async scrapeWithPuppeteer(url) {
        await this.initBrowser();
        
        const page = await this.browser.newPage();
        
        try {
            // Set user agent and viewport
            await page.setUserAgent(this.getRandomUserAgent());
            await page.setViewport({ width: 1920, height: 1080 });

            // Block unnecessary resources to speed up loading
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'stylesheet' || 
                    req.resourceType() === 'image' ||
                    req.resourceType() === 'font') {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Navigate to page
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: this.timeout 
            });

            // Wait for dynamic content
            await page.waitForTimeout(2000);

            // Get page content
            const content = await page.content();
            
            // Extract emails
            const emails = this.extractEmailsFromText(content);
            const bestEmail = this.selectBestEmail(emails, url);

            return {
                email: bestEmail,
                method: 'puppeteer',
                totalFound: emails.length
            };

        } finally {
            await page.close();
        }
    }

    /**
     * Search for contact page and scrape it
     */
    async searchContactPage(baseUrl) {
        const contactPaths = [
            '/contact',
            '/contact-us',
            '/about',
            '/about-us',
            '/info',
            '/location',
            '/locations',
            '/hours',
            '/contact.html',
            '/contact.php'
        ];

        for (const path of contactPaths) {
            try {
                const contactUrl = this.resolveUrl(baseUrl, path);
                const result = await this.scrapeWithAxios(contactUrl);
                
                if (result.email) {
                    return {
                        ...result,
                        method: 'contact_page',
                        contactUrl
                    };
                }
            } catch (error) {
                // Continue to next path
            }
        }

        return { email: null, method: 'contact_page_not_found' };
    }

    /**
     * Extract emails from text using regex
     */
    extractEmailsFromText(text) {
        // Email regex pattern
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        const matches = text.match(emailRegex) || [];
        
        // Filter and validate emails
        const validEmails = matches
            .map(email => email.toLowerCase().trim())
            .filter(email => this.isValidBusinessEmail(email))
            .filter((email, index, array) => array.indexOf(email) === index); // Remove duplicates

        return validEmails;
    }

    /**
     * Validate if email appears to be a business email
     */
    isValidBusinessEmail(email) {
        if (!emailValidator.validate(email)) {
            return false;
        }

        // Filter out common non-business emails
        const excludePatterns = [
            /noreply/i,
            /no-reply/i,
            /donotreply/i,
            /webmaster/i,
            /postmaster/i,
            /mailer-daemon/i,
            /example\./i,
            /test@/i,
            /admin@.*\.com$/i // Generic admin emails
        ];

        for (const pattern of excludePatterns) {
            if (pattern.test(email)) {
                return false;
            }
        }

        // Filter out personal email services for business context
        const personalDomains = [
            'gmail.com',
            'yahoo.com',
            'hotmail.com',
            'outlook.com',
            'aol.com',
            'icloud.com',
            'live.com',
            'msn.com'
        ];

        const domain = email.split('@')[1];
        const isPersonalDomain = personalDomains.includes(domain);

        // Allow personal domains but give them lower priority
        return true;
    }

    /**
     * Select the best email from found emails
     */
    selectBestEmail(emails, websiteUrl) {
        if (emails.length === 0) return null;
        if (emails.length === 1) return emails[0];

        // Extract domain from website URL
        let websiteDomain = '';
        try {
            const url = new URL(websiteUrl);
            websiteDomain = url.hostname.replace('www.', '');
        } catch (error) {
            // Ignore error
        }

        // Scoring system for email selection
        const scoredEmails = emails.map(email => {
            let score = 0;
            const domain = email.split('@')[1];

            // Prefer emails from same domain as website
            if (websiteDomain && domain === websiteDomain) {
                score += 100;
            }

            // Prefer business-like email prefixes
            const prefix = email.split('@')[0].toLowerCase();
            const businessPrefixes = [
                'info', 'contact', 'hello', 'mail', 'office', 'admin',
                'manager', 'owner', 'restaurant', 'reservations', 'booking'
            ];

            for (const businessPrefix of businessPrefixes) {
                if (prefix.includes(businessPrefix)) {
                    score += 50;
                    break;
                }
            }

            // Penalize personal email services
            const personalDomains = [
                'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'
            ];
            if (personalDomains.includes(domain)) {
                score -= 20;
            }

            // Prefer shorter, cleaner emails
            if (email.length < 30) {
                score += 10;
            }

            // Penalize emails with numbers (often less professional)
            if (/\d/.test(prefix)) {
                score -= 5;
            }

            return { email, score };
        });

        // Sort by score and return best email
        scoredEmails.sort((a, b) => b.score - a.score);
        return scoredEmails[0].email;
    }

    /**
     * Resolve relative URL to absolute URL
     */
    resolveUrl(baseUrl, path) {
        try {
            return new URL(path, baseUrl).toString();
        } catch (error) {
            return baseUrl + path;
        }
    }

    /**
     * Get random user agent
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Batch process restaurants for email extraction
     */
    async extractEmailsFromRestaurants(restaurants, options = {}) {
        const {
            concurrency = 3,
            delay = this.requestDelay,
            onProgress = null
        } = options;

        const results = [];
        const total = restaurants.length;
        let processed = 0;

        // Process in batches to respect rate limits
        for (let i = 0; i < restaurants.length; i += concurrency) {
            const batch = restaurants.slice(i, i + concurrency);
            
            const batchPromises = batch.map(async (restaurant) => {
                try {
                    const result = await this.extractEmailFromWebsite(restaurant);
                    processed++;
                    
                    if (onProgress) {
                        onProgress(processed, total, result);
                    }

                    return {
                        restaurantId: restaurant.id,
                        restaurantName: restaurant.name,
                        website: restaurant.website,
                        ...result
                    };
                } catch (error) {
                    processed++;
                    this.logger.error('Email extraction failed', {
                        restaurantName: restaurant.name,
                        website: restaurant.website,
                        error: error.message
                    });

                    if (onProgress) {
                        onProgress(processed, total, { email: null, error: error.message });
                    }

                    return {
                        restaurantId: restaurant.id,
                        restaurantName: restaurant.name,
                        website: restaurant.website,
                        email: null,
                        method: 'error',
                        error: error.message
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Delay between batches
            if (i + concurrency < restaurants.length) {
                await this.delay(delay);
            }
        }

        // Log summary
        const successful = results.filter(r => r.email).length;
        this.logger.info('Batch email extraction completed', {
            total: restaurants.length,
            successful,
            successRate: `${((successful / total) * 100).toFixed(1)}%`
        });

        return results;
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test scraping capability
     */
    async testScraping(url) {
        try {
            const result = await this.scrapeWithAxios(url);
            return {
                success: true,
                ...result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get scraping statistics
     */
    getScrapingStats() {
        // This would typically come from database or cache
        return {
            totalScrapes: 0,
            successfulScrapes: 0,
            failedScrapes: 0,
            emailsFound: 0,
            averageResponseTime: 0
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        await this.closeBrowser();
        this.logger.info('Web scraping service cleaned up');
    }
}

module.exports = new WebScrapingService();