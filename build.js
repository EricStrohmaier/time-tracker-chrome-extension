const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get environment from command line arguments
const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const env = isProd ? 'production' : 'development';

console.log(`Building extension for ${env} environment...`);

// Set environment variables
process.env.NODE_ENV = env;

// Run webpack build
try {
  execSync('webpack --config webpack.config.js', { stdio: 'inherit' });
  console.log('Build completed successfully!');
  
  // Create zip file for production
  if (isProd) {
    console.log('Creating production zip file...');
    
    // Make sure dist directory exists
    if (fs.existsSync(path.join(__dirname, 'dist'))) {
      // Create zip file
      execSync('cd dist && zip -r ../time-tracker-extension.zip *', { stdio: 'inherit' });
      console.log('Production zip file created: time-tracker-extension.zip');
    } else {
      console.error('Error: dist directory not found');
      process.exit(1);
    }
  }
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
