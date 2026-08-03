const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const sourceIcon = 'C:\\Users\\eyob\\.gemini\\antigravity-ide\\brain\\c5319af6-da7f-4cf3-8218-40fde483f076\\app_icon_1785655819247.png';
const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function run() {
  try {
    const image = await Jimp.read(sourceIcon);
    
    for (const [folder, size] of Object.entries(sizes)) {
      const targetFolder = path.join(resDir, folder);
      if (fs.existsSync(targetFolder)) {
        const resized = image.clone().resize(size, size);
        
        await resized.writeAsync(path.join(targetFolder, 'ic_launcher.png'));
        await resized.writeAsync(path.join(targetFolder, 'ic_launcher_round.png'));
        console.log(`Updated icons in ${folder} to ${size}x${size}`);
      }
    }
    console.log('App icon successfully generated and resized!');
  } catch (e) {
    console.error('Error applying icon:', e);
  }
}

run();
