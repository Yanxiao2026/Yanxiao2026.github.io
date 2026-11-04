const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const dir = 'C:/Users/windi/WorkBuddy/project/sanxingdui/assets';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': 'https://commons.wikimedia.org/',
        'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout')));
  });
}

function valid(buf, ext) {
  if (!buf || buf.length < 20000) return false;
  if (ext === 'jpg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[buf.length - 2] === 0xFF && buf[buf.length - 1] === 0xD9;
  if (ext === 'png') return buf.slice(1, 4).toString() === 'PNG';
  return true;
}

(async () => {
  const lines = fs.readFileSync(path.join(dir, 'urls.txt'), 'utf8').trim().split('\n');
  const jobs = lines.map(l => {
    const [key, url] = l.split('\t');
    const clean = url.split('?')[0];
    const ext = /\.png$/i.test(clean) ? 'png' : 'jpg';
    return { key, url: clean, ext, file: path.join(dir, `${key}.${ext}`) };
  });

  const todo = jobs.filter(j => !(fs.existsSync(j.file) && valid(fs.readFileSync(j.file), j.ext)));
  console.log('todo:', todo.map(j => j.key).join(', ') || '(none)');
  if (!todo.length) return;

  // 等待限流解除
  for (let i = 0; i < 40; i++) {
    try {
      const probe = await get(jobs[0].url);
      console.log('probe', probe.status);
      if (probe.status === 200) break;
    } catch (e) { console.log('probe err', e.message); }
    await sleep(30000);
  }

  for (const j of todo) {
    let ok = false;
    for (let a = 0; a < 6 && !ok; a++) {
      try {
        const r = await get(j.url);
        if (r.status === 200 && valid(r.body, j.ext)) {
          fs.writeFileSync(j.file, r.body);
          console.log('OK', j.key, r.body.length);
          ok = true;
        } else {
          console.log('fail', j.key, r.status, r.body.length);
          await sleep(25000);
        }
      } catch (e) {
        console.log('err', j.key, e.message);
        await sleep(15000);
      }
    }
    await sleep(8000);
  }
  console.log('done');
})();
