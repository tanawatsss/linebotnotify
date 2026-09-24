const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

const memberNameCache = new Map();

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  const groupId = event.source && event.source.groupId;
  if (!groupId) return;

  if (event.source.userId) {
    await cacheMemberName(groupId, event.source.userId);
  }

  if (event.type === 'memberLeft') {
    const leftUserIds = event.left.members.map((m) => m.userId);
    const names = leftUserIds.map(
      (id) => memberNameCache.get(`${groupId}:${id}`) || 'สมาชิกไม่ทราบชื่อ'
    );

    const time = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
    });

    const text =
      `⚠️ แจ้งเตือน: มีสมาชิกออกจากกลุ่ม\n` +
      `ชื่อ: ${names.join(', ')}\n` +
      `เวลา: ${time}\n` +
      `(ระบบ LINE ไม่ระบุว่าออกเองหรือถูกเตะ)`;

    await client.pushMessage(groupId, { type: 'text', text });

    leftUserIds.forEach((id) => memberNameCache.delete(`${groupId}:${id}`));
  }

  if (event.type === 'leave') {
    console.log(`บอทถูกเตะออกจากกลุ่ม: ${groupId}`);
  }
}

async function cacheMemberName(groupId, userId) {
  const key = `${groupId}:${userId}`;
  if (memberNameCache.has(key)) return;
  try {
    const profile = await client.getGroupMemberProfile(groupId, userId);
    memberNameCache.set(key, profile.displayName);
  } catch (err) {}
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`LINE bot webhook listening on port ${port}`);
});
