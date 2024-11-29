import {Context, h, Schema} from 'koishi'
import {DateTime} from 'luxon';
import puppeteer from 'puppeteer';

export const name = 'phizone'
export const inject = ['database', 'puppeteer']

export interface Config {
}
const koishi_1 = require('koishi');

export const Config: Schema<Config> = Schema.object({})

declare module 'koishi' {
  interface User {
    phizoneId: string
  }
}

export const apiEndpoint = 'https://api.phizone.cn'

export function apply(ctx: Context) {
  ctx.database.extend('user', {
    phizoneId: {
      type: 'string'
    }
  })

  //顶级命令
  ctx.command(`phizone`, 'PhiZone相关命令')
    .alias('pz')
    .userFields(['phizoneId'])
    .action(async ({session}) => {
      //检查是否绑定
      if (session.user.phizoneId == ``) {
        return session.text('你还没有绑定PhiZone账号喵。');
      }
      //查询最近成绩
      //https://api.phizone.cn/records?rangeOwnerId=16278&Page=1&PerPage=1
      let res = await fetch(apiEndpoint + '/records?rangeOwnerId=' + session.user.phizoneId + `&Desc=true&Page=1`);
      if (res.status != 200) {
        return session.text('喵喵未知错误。');
      }
      let json = await res.json();
      let recordData = json.data[0];
      let userName = recordData.owner.userName;
      return session.text(
        `${userName} 的最近成绩：
        ${showRecordBrief(recordData)}\n
        `
      );
    });

  ctx.command(`phizone.bind <userid>`, '绑定PhiZone用户', {checkArgCount: true})
    .userFields(['phizoneId'])
    .action(async ({session}, userid) => {
      //将id绑定到用户
      if (session?.user) {
        let user = session.user;
        //请求api，获得用户信息
        const res = await fetch(apiEndpoint + '/users/' + userid);
        //检查状态码
        if (res.status == 404) {
          return session?.text('呃，用户不存在喵。');
        }
        if (res.status != 200) {
          return session?.text('喵喵未知错误。');
        }
        //序列化返回的数据为json
        const data = await res.json();
        user.phizoneId = userid;
        session.user = user;
        return session?.text('绑定成功，欢迎回来' + data.data.userName);
      }
    });
  ctx.command('phizone.best [userid:string]', '获取用户最佳成绩', {checkUnknown: true})
    .alias('phizone.pb')
    .alias('phizone.b19')
    .userFields(['phizoneId'])
    .action(async ({session}, userid) => {
      let userPhizoneId = userid;
      let user = session?.user;
      if (userPhizoneId == undefined) {
        userPhizoneId = user.phizoneId;
        //如果还是空的，说明用户未绑定
        if (userPhizoneId == ``) {
          return session?.text('你还没有绑定PhiZone账号喵。');
        }
      }
      let res = await fetch(apiEndpoint + '/users/' + userPhizoneId);
      if (res.status == 404) {
        return session?.text('用户有误喵。');
      }
      if (res.status != 200) {
        return session?.text('喵喵未知错误。');
      }
      let info = await res.json();
      let pb = await (await fetch(apiEndpoint + '/users/' + userPhizoneId + '/personalBests')).json();
      //先检查map是否为空，如果为空直接返回
      if (pb.data.best19.length == 0) {
        return session?.text(`${info.data.userName} 真的玩过游戏吗？`);
      }
      let phi1 = showRecord(pb.data.phi1);// 最高
      const b19 = pb.data.best19.map((record: any) => showRecord(record)).join('\n');
      //1200*1900
      /*
      //读取同目录下的best.html
      const fs = require('fs');
      let html = await fs.promises.readFile(__dirname + '/best.html', 'utf-8');
      const screenshot = await renderHtmlToImage(html);
      //返回图片，使用koishi发送图片
      session.send(h.image(screenshot, 'image/png'))
      */
      //返回最终结果
      return session?.text(`${info.data.userName} 的个人最佳：\n\nPhi 1：\n${phi1}\n\nBest 19：\n${b19}\n\n本项目也招UI!`);
    });
  ctx.command(`phizone.chartsearch <...byword>`, '搜索谱面', {checkArgCount: true})
    .alias('phizone.search')
    .alias('phizone.cs')
    .alias('phizone.sc')
    .alias('phizone.s')
    .action(async ({session}, ...byword) => {
      //请求api，获得谱面信息
      let charts = await fetch(`${apiEndpoint}/charts?search=${byword.join(' ')}&perPage=3`);
      //检查data长度，不检查状态码
      let data = await charts.json();
      if (data.data.length == 0) {
        return session?.text('没有找到相关谱面喵。');
      }
      const results = data.data.map(chart => showChart(chart, true)).join(" \n\n");
      return session.text(`找到了以下谱面：\n\n ${results}`);
    });
  ctx.command(`phizone.chartquery <chartId:string>`, `查询特定谱面`, {checkArgCount: true})
    .alias('phizone.chartinfo')
    .alias('phizone.query')
    .alias('phizone.info')
    .alias('phizone.cq')
    .alias('phizone.qc')
    .alias('phizone.q')
    .alias('phizone.i')
    .action(async ({session}, chartId) => {
      let res = await fetch(apiEndpoint + '/charts/' + chartId);
      if (res.status == 404) {
        return session?.text('没有找到相关谱面喵。');
      }
      if (res.status != 200) {
        return session?.text('喵喵未知错误。');
      }
      let chart = await res.json();
      return session?.text(showChart(chart.data));
    });
  ctx.command(`phizone.randomchart`, `随机谱面`)
    .alias('phizone.random')
    .alias('phizone.rc')
    .alias('phizone.r')
    .action(async ({session}) => {
      let res = await fetch(apiEndpoint + '/charts/random');
      if (res.status != 200) {
        return session?.text('喵喵未知错误。');
      }
      let chart = await res.json();
      return session?.text(showChart(chart.data));
    });


}

function showRecord(record: any): string {
  return `${record.chart.song.title} [${record.chart.level} ${Math.floor(record.chart.difficulty)}] ${record.score.toString().padStart(7, '0')} ${(record.accuracy * 100).toFixed(2)}% ${record.rks.toFixed(3)}`;
}

function showChart(chart: any, brief: boolean = false): string {
  const userPattern = /\[PZUser(Mention)?:\d+:(.+?):PZRT\]/g;
  const userPatternName = '$2';

  const authorName = chart.song.authorName.replace(userPattern, userPatternName);
  const illustrator = chart.illustrator || chart.song.illustrator;
  const chartAuthorName = chart.authorName.replace(userPattern, userPatternName);

  if (brief) {
    return `${chart.song.title} [${chart.level} ${chart.difficulty}]${chart.isRanked ? ' [Ranked]' : ''}
 曲师：${authorName}
 画师：${illustrator}
 谱师：${chartAuthorName}
 物量：${chart.noteCount}
 ID：${chart.id}`;
  } else {
    const tags = chart.tags.map(tag => tag.name).join('，');
    return `${chart.song.title} [${chart.level} ${Math.floor(chart.difficulty)}]${chart.isRanked ? ' [Ranked]' : ''}
 曲师：${authorName}
 画师：${illustrator}
 谱师：${chartAuthorName}
 定数：${chart.difficulty.toFixed(1)}
 物量：${chart.noteCount}
 评分：${chart.rating.toFixed(2)}（配置 ${chart.ratingOnArrangement.toFixed(2)} / 游玩体验 ${chart.ratingOnGameplay.toFixed(2)} / 视觉效果 ${chart.ratingOnVisualEffects.toFixed(2)} / 创新度 ${chart.ratingOnCreativity.toFixed(2)}）
 游玩数：${chart.playCount}
 点赞数：${chart.likeCount}
 创建时间：${convertTime(chart.dateCreated)}
 更新时间：${convertTime(chart.dateUpdated)}
 文件更新时间：${convertTime(chart.dateFileUpdated)}
 标签：${tags}
 ID：${chart.id}`;
  }
}


function convertTime(time: string): string {
  const dtUtc = DateTime.fromISO(time.split('.')[0], {zone: 'utc'});
  const dtLocal = dtUtc.setZone('Asia/Shanghai');
  const localTime = dtLocal.toFormat('yyyy-MM-dd HH:mm:ss');
  return localTime;
}

function showRecordBrief(data: any): string {
  return `
 ${data.chart.song.title} [${data.chart.level} ${Math.floor(data.chart.difficulty)}]
 分数：${data.score.toString().padStart(7, '0')}
 准确率：${(data.accuracy * 100).toFixed(2)}%
 最大连击：${data.maxCombo}
 Perfect：${data.perfect}
 Good：${data.goodEarly + data.goodLate} [E:${data.goodEarly} L:${data.goodLate}]
 Bad：${data.bad}
 Miss：${data.miss}
 RKS：${data.rks.toFixed(3)}
 标准差：${data.stdDeviation}ms
 游玩时间：${convertTime(data.dateCreated)}`;
}

async function renderHtmlToImage(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  try {
      await page.setViewport({ width: 1200, height: 1900 });
      await page.setContent(html, { waitUntil: 'load' });

      // Puppeteer 的 screenshot 方法返回 Uint8Array，这里断言为 Buffer
      const imageBuffer = await page.screenshot({ type: 'png', fullPage: true }) as Buffer;

      return imageBuffer; // 返回二进制数据
  } finally {
      await browser.close();
  }
}