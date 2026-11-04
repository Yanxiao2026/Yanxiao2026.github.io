const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const dir = 'C:/Users/windi/WorkBuddy/project/sanxingdui/assets';

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://commons.wikimedia.org/',
        'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(get(next, redirects + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const lines = fs.readFileSync(path.join(dir, 'urls.txt'), 'utf8').trim().split('\n');
  for (const line of lines) {
    const [key, url] = line.split('\t');
    const ext = /\.png(\?|$)/i.test(url) ? 'png' : 'jpg';
    const file = path.join(dir, `${key}.${ext}`);
    if (fs.existsSync(file) && fs.statSync(file).size > 150000 && fs.readFileSync(file).slice(0, 2).toString('hex') !== '3c21') {
      console.log('OK  ', key, fs.statSync(file).size);
      continue;
    }
    let done = false;
    for (let attempt = 0; attempt < 8 && !done; attempt++) {
      let r;
      try { r = await get(url); } catch (e) { console.log('ERR ', key, e.message); await sleep(8000); continue; }
      const isImg = (r.status === 200) && (r.body[0] === 0xFF || r.body.slice(1, 4).toString() === 'PNG');
      if (isImg) {
        fs.writeFileSync(file, r.body);
        console.log('DL  ', key, r.body.length);
        done = true;
      } else {
        const wait = 15000 * (attempt + 1);
        console.log('wait', key, 'status', r.status, 'sleep', wait / 1000 + 's');
        await sleep(wait);
      }
    }
    if (!done) console.log('FAIL', key);
    await sleep(4000);
  }
})();
