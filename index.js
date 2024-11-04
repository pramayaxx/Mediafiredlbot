const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const token = '7415694573:AAG_us4QH-goaNZ-h7yPW6wmL1SK6rUCfGs'; // Replace with your Telegram bot token
const bot = new TelegramBot(token, { polling: true });
const channelUsername = '@Big_Mouse_Inc'; // Replace with your channel username

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.43",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 OPR/86.0.4240.198",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0"
];

const extractDownloadLink = (html) => {
  const $ = cheerio.load(html);
  const link = $('a[href*="download"]').attr('href');
  return link ? link : null;
};

const getMediaFireDownloadLink = async (url) => {
  try {
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Referer': url
      }
    });
    const downloadLink = extractDownloadLink(response.data);
    return downloadLink;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const downloadFile = async (url, dest) => {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url);
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on("error", reject);
    fileStream.on("finish", resolve);
  });
};

const checkMembership = async (userId) => {
  try {
    const chatMember = await bot.getChatMember(channelUsername, userId);
    return ['creator', 'administrator', 'member'].includes(chatMember.status);
  } catch (error) {
    console.error(error);
    return false;
  }
};

bot.onText(/\/start/, (msg) => {
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Check Membership', callback_data: 'check_membership' }]
      ]
    }
  };
  bot.sendMessage(msg.chat.id, 'Welcome to the MediaFire Link Bot! Please join our channel @nepdevs to use this bot.', opts);
});

bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const userId = callbackQuery.from.id;
  
  if (callbackQuery.data === 'check_membership') {
    const isMember = await checkMembership(userId);
    if (isMember) {
      bot.sendMessage(message.chat.id, 'You are a member! Please send me a MediaFire link to get the file.');
    } else {
      bot.sendMessage(message.chat.id, 'You are not a member. Please join @nepdevs to use this bot.');
    }
  }
});

bot.onText(/https?:\/\/(www\.)?mediafire\.com\/file\/[^\s]+/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const mediaFireUrl = match[0];

  const isMember = await checkMembership(userId);
  if (!isMember) {
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Check Membership', callback_data: 'check_membership' }]
        ]
      }
    };
    bot.sendMessage(chatId, 'You are not a member. Please join @Big_Mouse_Inc to use this bot.', opts);
    return;
  }

  bot.sendMessage(chatId, 'Fetching and downloading file, please wait...');

  const directDownloadUrl = await getMediaFireDownloadLink(mediaFireUrl);

  if (directDownloadUrl) {
    const fileName = path.basename(directDownloadUrl.split('?')[0]);
    const filePath = path.join(__dirname, fileName);

    await downloadFile(directDownloadUrl, filePath);

    bot.sendDocument(chatId, filePath).then(() => {
      fs.unlinkSync(filePath); // Remove the file after sending it
    }).catch(err => {
      bot.sendMessage(chatId, 'Sorry, I could not send the file immediately. The file has been saved locally and will be sent shortly.');
      console.error(err);

      // Schedule a retry to send the file after a short delay
      setTimeout(() => {
        bot.sendDocument(chatId, filePath).then(() => {
          fs.unlinkSync(filePath); // Remove the file after sending it
        }).catch(err => {
          console.error('Failed to send the file on retry:', err);
        });
      }, 5000); // Retry after 5 seconds
    });
  } else {
    bot.sendMessage(chatId, 'Sorry, I could not find the direct download URL.');
  }
});

bot.on('message', (msg) => {
  if (!msg.text.match(/\/start/) && !msg.text.match(/https?:\/\/(www\.)?mediafire\.com\/file\/[^\s]+/)) {
    bot.sendMessage(msg.chat.id, 'Please send a valid MediaFire link.');
  }
});
