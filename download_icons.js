const https = require('https');
const fs = require('fs');
const path = require('path');

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'tauri', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// List of icon files to download
const icons = [
  {
    url: 'https://raw.githubusercontent.com/tauri-apps/tauri/dev/examples/.icons/icon.ico',
    dest: path.join(iconsDir, 'icon.ico')
  },
  {
    url: 'https://raw.githubusercontent.com/tauri-apps/tauri/dev/examples/.icons/icon.icns',
    dest: path.join(iconsDir, 'icon.icns')
  },
  {
    url: 'https://raw.githubusercontent.com/tauri-apps/tauri/dev/examples/.icons/32x32.png',
    dest: path.join(iconsDir, '32x32.png')
  },
  {
    url: 'https://raw.githubusercontent.com/tauri-apps/tauri/dev/examples/.icons/128x128.png',
    dest: path.join(iconsDir, '128x128.png')
  },
  {
    url: 'https://raw.githubusercontent.com/tauri-apps/tauri/dev/examples/.icons/128x128@2x.png',
    dest: path.join(iconsDir, '128x128@2x.png')
  }
];

// Function to download a file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
        console.log(`Downloaded: ${dest}`);
      });
    }).on('error', err => {
      fs.unlink(dest, () => {}); // Delete the file if an error occurs
      reject(err);
    });
  });
}

// Download all icon files
async function downloadIcons() {
  for (const icon of icons) {
    try {
      await downloadFile(icon.url, icon.dest);
    } catch (error) {
      console.error(`Error downloading ${icon.url}: ${error}`);
    }
  }
}

// Run the download
downloadIcons()
  .then(() => console.log('All downloads completed!'))
  .catch(err => console.error('Download failed:', err)); 