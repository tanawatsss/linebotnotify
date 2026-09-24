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

  // บันทึกชื่อสมาชิกเก็บไว้ใน Cache
  if (event.source.userId) {
    await cacheMemberName(groupId, event.source.userId);
  }

  // เมื่อมีสมาชิกออกจากกลุ่ม (กดออกเอง หรือ โดนเตะ)
  if (event.type === 'memberLeft') {
    const leftUserIds = event.left.members.map((m) => m.userId);
    const kickerUserId = event.source.userId; // ไอดีของคนที่ทำการเตะ (ถ้าเป็นการเตะ)
    
    const names = leftUserIds.map(
      (id) => memberNameCache.get(`${groupId}:${id}`) || 'สมาชิกไม่ทราบชื่อ'
    );
    const kickerName = memberNameCache.get(`${groupId}:${kickerUserId}`) || 'สมาชิกในกลุ่ม';

    const time = new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
    });

    // 1. ส่งข้อความแจ้งเตือนเข้ากลุ่ม
    const text =
      `⚠️ แจ้งเตือน: มีสมาชิกออกจากกลุ่ม\n` +
      `ผู้ถูกเตะ/ออก: ${names.join(', ')}\n` +
      `ผู้กระทำ/เตะ: ${kickerName}\n` +
      `เวลา: ${time}`;

    await client.pushMessage(groupId, { type: 'text', text });

    // 2. สั่งเตะคนที่เตะเพื่อนออกจากกลุ่มทันที (ถ้ามี kickerUserId และไม่ใช่คนเดียวกับคนที่ออก)
    if (kickerUserId && !leftUserIds.includes(kickerUserId)) {
      try {
        // สั่งเตะคนก่อกวนออกจากกลุ่ม
        await client.deleteGroupMember(groupId, kickerUserId);
        
        await client.pushMessage(groupId, {
          type: 'text',
          text: `🚨 ระบบทำการเตะ ${kickerName} ออกจากกลุ่มเรียบร้อยแล้ว เนื่องจากทำการเตะสมาชิกคนอื่น!`
        });
      } catch (err) {
        console.error('ไม่สามารถเตะสมาชิกได้ (บอทอาจจะไม่ได้เป็น Admin):', err);
      }
    }

    // ล้าง Cache ของคนที่ออกจากกลุ่ม
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
   
