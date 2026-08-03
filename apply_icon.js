const fs = require('fs');
const path = require('path');

const sourceIcon = 'C:\\Users\\eyob\\.gemini\\antigravity-ide\\brain\\c5319af6-da7f-4cf3-8218-40fde483f076\\app_icon_1785655819247.png';
const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

const folders = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];

try {
  const iconBuffer = fs.readFileSync(sourceIcon);
  
  for (const folder of folders) {
    const targetFolder = path.join(resDir, folder);
    if (fs.existsSync(targetFolder)) {
      // Overwrite square icon
      fs.writeFileSync(path.join(targetFolder, 'ic_launcher.png'), iconBuffer);
      // Overwrite round icon (using the same square image, Android will mask it if needed)
      fs.writeFileSync(path.join(targetFolder, 'ic_launcher_round.png'), iconBuffer);
      console.log(`Updated icons in ${folder}`);
    }
  }
  console.log('App icon successfully replaced!');
} catch (e) {
  console.error('Error applying icon:', e);
}
