module.exports = {
  apps: [{
    name: 'restaurant-scraper',
    script: './server.js',
    
    // Process configuration
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    
    // Environment variables
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Add your production environment variables here
      DATABASE_URL: 'postgresql://restaurant_user:your_password@localhost:5432/restaurant_scraper',
      GOOGLE_PLACES_API_KEY: 'AIzaSyAdab6wLyhoVPyvz5qeKv3W2kAonXWb7PM',
      GOOGLE_GEOCODING_API_KEY: 'AIzaSyAdab6wLyhoVPyvz5qeKv3W2kAonXWb7PM',
      DOMAIN: 'rest-data.rogersgreengroup.com',
      BASE_URL: 'https://rest-data.rogersgreengroup.com',
      SESSION_SECRET: 'your-super-secret-session-key-change-this-in-production',
      JWT_SECRET: 'your-super-secret-jwt-key-change-this-in-production'
    },
    
    // Logging
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Performance and monitoring
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024',
    
    // Restart configuration
    watch: false, // Set to true for development, false for production
    ignore_watch: ['node_modules', 'logs', 'uploads', 'tmp'],
    watch_options: {
      followSymlinks: false
    },
    
    // Advanced process management
    min_uptime: '10s',
    max_restarts: 10,
    autorestart: true,
    
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 8000,
    
    // Health monitoring
    health_check_grace_period: 3000,
    
    // Source map support for better error reporting
    source_map_support: true,
    
    // Merge logs from all instances
    merge_logs: true,
    
    // Instance configuration
    instance_var: 'INSTANCE_ID',
    
    // Cron restart (optional - restart every day at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Custom environment variables for different instances
    env_file: '.env'
  }],

  // Deployment configuration
  deploy: {
    production: {
      user: 'root',
      host: '66.29.133.107',
      ref: 'origin/main',
      repo: 'your-git-repository-url',
      path: '/opt/restaurant-scraper',
      'pre-deploy-local': '',
      'post-deploy': 'npm install --production && npm run migrate && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get update && apt-get install -y git'
    }
  }
};