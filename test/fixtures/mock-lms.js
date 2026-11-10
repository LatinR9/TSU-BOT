/**
 * Tiny mock LMS for end-to-end tests: a Moodle-like course behind a login form,
 * a cross-origin "embed" server (stands in for YouTube iframes), and a generic
 * non-Moodle course site.
 */
import http from "node:http";
import fs from "node:fs";

const page = (title, body, { moodle = true, loggedIn = true, bodyId = "page-mod-page-view" } = {}) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
${moodle ? `<script>window.M = { cfg: { wwwroot: location.origin } };</script>` : ""}
</head>
<body id="${moodle ? bodyId : "home"}" class="${moodle ? "pagelayout-incourse" : ""} ${loggedIn ? "" : "notloggedin"}">
${moodle && loggedIn ? `<nav class="navbar"><div class="usermenu"><a id="user-menu-toggle" href="#">ผู้เรียน</a><a href="/login/logout.php?sesskey=x">ออกจากระบบ</a></div></nav>` : ""}
<div role="main" id="region-main">${body}</div></body></html>`;

const activity = (id, modtype, name, href, extra = "") =>
  `<li class="activity modtype_${modtype}" id="module-${id}"><div class="activity-item" data-activityname="${name}">
   <div class="activityname"><a class="aalink" href="${href}"><span class="instancename">${name}<span class="accesshide"> ${modtype}</span></span></a></div>${extra}</div></li>`;

const DONE_BADGE = `<div data-region="completionrequirements"><span class="badge alert-success">Done: View</span></div>`;
const TODO_BADGE = `<div data-region="completionrequirements"><span class="badge badge-light">To do: View</span></div>`;

const longText = (n) =>
  Array.from({ length: n }, (_, i) => `<p>ย่อหน้าที่ ${i + 1} — เนื้อหาเอกสารประกอบการเรียน</p>`).join("");

function send(res, status, html, headers = {}) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(html);
}

function serveVideo(req, res, file) {
  const stat = fs.statSync(file);
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace("bytes=", "").split("-");
    const start = Number(s);
    const end = e ? Number(e) : stat.size - 1;
    res.writeHead(206, {
      "content-type": "video/webm",
      "content-range": `bytes ${start}-${end}/${stat.size}`,
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": "video/webm", "content-length": stat.size, "accept-ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  }
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

export async function startMockLms({ videoFile }) {
  const hits = [];

  const embed = http.createServer((req, res) => {
    if (req.url.startsWith("/clip.webm")) return serveVideo(req, res, videoFile);
    send(res, 200, `<!doctype html><body style="margin:0"><video src="/clip.webm" style="width:100%"></video></body>`);
  });
  const embedPort = await listen(embed);
  const embedOrigin = `http://127.0.0.1:${embedPort}`;

  const main = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    hits.push(url.pathname + url.search);
    const authed = /MoodleSession=ok/.test(req.headers.cookie || "");
    const p = url.pathname;

    if (p === "/clip.webm") return serveVideo(req, res, videoFile);

    if (p === "/login/index.php") {
      if (req.method === "POST") {
        return send(res, 303, "", { location: "/course/view.php?id=1", "set-cookie": "MoodleSession=ok; Path=/" });
      }
      return send(
        res,
        200,
        page("Log in", `<form method="post"><input name="username"><input type="password" name="password"><button id="loginbtn">Log in</button></form>`, {
          loggedIn: false,
          bodyId: "page-login-index",
        })
      );
    }

    if (p.startsWith("/generic")) return serveGeneric(p, res);
    if (!authed) return send(res, 303, "", { location: "/login/index.php" });

    if (p === "/course/view.php") {
      const list = [
        activity(1, "page", "บทที่ 1 วิดีโอแนะนำรายวิชา", "/mod/page/view.php?id=1", TODO_BADGE),
        activity(2, "quiz", "แบบทดสอบก่อนเรียน", "/mod/quiz/view.php?id=2"),
        activity(3, "url", "บทที่ 2 วิดีโอ YouTube", "/mod/url/view.php?id=3"),
        activity(4, "resource", "เอกสารประกอบบทที่ 1", "/mod/resource/view.php?id=4"),
        activity(5, "book", "หนังสือบทที่ 3", "/mod/book/view.php?id=5"),
        activity(6, "forum", "กระดานถามตอบ", "/mod/forum/view.php?id=6"),
        activity(7, "assign", "ส่งงานครั้งที่ 1", "/mod/assign/view.php?id=7"),
        activity(8, "page", "บทที่ 0 ที่เรียนแล้ว", "/mod/page/view.php?id=8", DONE_BADGE),
        activity(9, "resource", "สไลด์ดาวน์โหลด", "/mod/resource/view.php?id=9"),
        activity(10, "url", "ลิงก์วิดีโอภายนอก", "/mod/url/view.php?id=10"),
      ].join("");
      return send(res, 200, page("Course", `<ul class="course-content section">${list}</ul>`, { bodyId: "page-course-view-topics" }));
    }
    if (p === "/mod/page/view.php") {
      return send(res, 200, page("Page", `<h2>วิดีโอ</h2><video controls src="/clip.webm" width="480"></video>`));
    }
    if (p === "/mod/url/view.php" && url.searchParams.get("id") === "3") {
      return send(res, 200, page("URL", `<iframe src="${embedOrigin}/embed.html" width="560" height="315"></iframe>`));
    }
    if (p === "/mod/url/view.php") {
      return send(res, 200, page("URL", `<div class="urlworkaround">คลิก <a href="${embedOrigin}/embed.html">ลิงก์นี้</a> เพื่อเปิด</div>`));
    }
    if (p === "/mod/resource/view.php" && url.searchParams.get("id") === "9") {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="slides.pptx"',
      });
      return res.end("fake-pptx");
    }
    if (p === "/mod/resource/view.php") {
      return send(res, 200, page("Resource", `<h2>เอกสาร</h2>${longText(200)}<p id="end">จบเอกสาร</p>`));
    }
    if (p === "/mod/book/view.php") {
      const ch = Number(url.searchParams.get("chapterid") || 1);
      const next = ch < 3 ? `<div class="navbottom"><a class="booknext" href="/mod/book/view.php?id=5&chapterid=${ch + 1}">Next</a></div>` : "";
      return send(res, 200, page(`Book ${ch}`, `<h2>บทที่ ${ch}</h2>${longText(60)}${next}`));
    }
    return send(res, 200, page("Other", "<p>other</p>"));
  });

  function serveGeneric(p, res) {
    const opts = { moodle: false };
    if (p === "/generic/course") {
      return send(
        res,
        200,
        page(
          "คอร์สออนไลน์",
          `<header><a href="/generic/profile">โปรไฟล์</a><a href="/generic/about">เกี่ยวกับเรา</a></header>
           <h1>คอร์สออนไลน์</h1>
           <ol>
             <li><a href="/generic/lesson/1">บทที่ 1 วิดีโอเริ่มต้น</a></li>
             <li><a href="/generic/quiz/1">แบบทดสอบบทที่ 1</a></li>
             <li><a href="/generic/docs/handout">เอกสารประกอบการเรียน</a></li>
             <li><a href="/generic/random">ติดต่อเจ้าหน้าที่</a></li>
           </ol>`,
          opts
        )
      );
    }
    if (p === "/generic/lesson/1") {
      return send(res, 200, page("บทที่ 1", `<iframe src="${embedOrigin}/embed.html" width="560" height="315"></iframe>`, opts));
    }
    if (p === "/generic/docs/handout") {
      return send(res, 200, page("เอกสาร", longText(150), opts));
    }
    return send(res, 200, page("x", "<p>x</p>", opts));
  }

  const mainPort = await listen(main);
  return {
    origin: `http://127.0.0.1:${mainPort}`,
    embedOrigin,
    hits,
    close: () => Promise.all([new Promise((r) => main.close(r)), new Promise((r) => embed.close(r))]),
  };
}
