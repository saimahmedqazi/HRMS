import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const targetDir = path.resolve(process.cwd(), process.env.GEOIP_DB_DIR || 'data/geoip');
fs.mkdirSync(targetDir, { recursive: true });

const tarballUrl = 'https://registry.npmjs.org/@ip-location-db/dbip-city-mmdb/-/dbip-city-mmdb-2.3.2026060513.tgz';
const tmpTgz = path.join(targetDir, 'dbip-city-mmdb.tgz');

console.log(`Downloading DB-IP City Lite MMDB (CC-BY-4.0) into ${targetDir}...`);
let downloaded = false;
for (let attempt = 1; attempt <= 10; attempt++) {
  try {
    execFileSync('curl', ['-sL', '-C', '-', '--max-time', '60', tarballUrl, '-o', tmpTgz], { stdio: 'inherit' });
    downloaded = true;
    break;
  } catch {
    console.warn(`Download interrupted (attempt ${attempt}/10), resuming...`);
  }
}
if (!downloaded) {
  throw new Error('Failed to download DB-IP City Lite MMDB after 10 attempts.');
}

execFileSync('tar', ['-xzf', tmpTgz, '-C', targetDir, '--strip-components=1', 'package/dbip-city-ipv4.mmdb', 'package/dbip-city-ipv6.mmdb'], { stdio: 'inherit' });
fs.rmSync(tmpTgz, { force: true });
console.log('GeoIP MMDB databases updated successfully.');
