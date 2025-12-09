import { logger } from "firebase-functions";
import axios from "axios";
import { processWithdrawalStatus, verifyAdmin } from "./bot-functions.js";

const BOT_URL = process.env.BOT_URL;
const ADMIN_CHATID = process.env.ADMIN_CHATID;

export async function telegramWebhook(request, reply) {
  try {
    const update = request.body;
    if (!update.message && !update.callback_query) {
      logger.warn("No message or callback_query found in update");
      return reply.code(200).send("No message or query");
    }

    const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    const message = update.message?.text;

    logger.info("Received message", { chatId, message });

    if (chatId != ADMIN_CHATID) {
      logger.warn("Message not from Admin");
      await axios.post(`${BOT_URL}/sendMessage`, {
        chat_id: ADMIN_CHATID,
        text: `There was a message attempt from ${chatId}`,
        parse_mode: "HTML",
      });
      return reply.code(200).send("ok");
    }

    if (update.callback_query) {
      return await handleCallback(update.callback_query, reply);
    } else if (update.message) {
      return await handleTextMessage(update.message, reply);
    }
  } catch (error) {
    logger.error("Error handling Telegram webhook", error);
    reply.status(500).send("Internal Server Error");
  }
}

async function handleTextMessage(textMessage, reply) {
  const message = textMessage.text;
  const chatId = textMessage.chat.id;
  if (message == "/start") {
    await axios.post(`${BOT_URL}/sendMessage`, {
      chat_id: chatId,
      text: "Do you want tea or coffee?",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "☕ Tea", callback_data: "order_tea" },
            { text: "☕ Coffee", callback_data: "order_coffee" }
          ],
          [
            { text: "Back", callback_data: "back" }
          ]
        ]
      }
    });
  } else {
    const replyText = `<b>You said:</b> ${message}`;

    await axios.post(`${BOT_URL}/sendMessage`, {
      chat_id: chatId,
      text: replyText,
      parse_mode: "HTML",
    });
  }

  reply.code(200).send({ status: "ok" });
}

async function handleCallback(query, reply) {
  const callbackId = query.id;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id; // <-- Get the message ID
  const data = query.data;

  // Acknowledge the button press (to stop loading spinner)
  await axios.post(`${BOT_URL}/answerCallbackQuery`, {
    callback_query_id: callbackId,
  });

  let replyText = "";
  if (data.startsWith("adminApprove") || data.startsWith("adminDeny")) {
    const parts = data.split('_');
    const approve = data.includes("adminApprove") ? true : false;
    const id = parts[2];
    const role = parts[1];

    try {
      const success = await verifyAdmin(approve, id, role); // Assuming verifyAdmin handles db update
      if (approve) {
        replyText = success ? "✅ Administrator approved successfully!" : "❌ Failed to approve Administrator";
      } else {
        replyText = success ? "🚫 Attempt called off and cleared." : "❌ Failed to call off attempt.";
      }
    } catch (error) {
      logger.error("Error in verifyAdmin:", error);
      replyText = "An error occurred during verification. Please check logs.";
    }

    
  } else if (data.startsWith("withdrawalSuccess_")) {
    const TxId = data.split('_')[1];
    await processWithdrawalStatus(TxId, 'success');
    replyText = `✅ Withdrawal ${TxId} marked as successful!`;

  } else if (data.startsWith("withdrawalReject_")) {
    const TxId = data.split('_')[1];
    await processWithdrawalStatus(TxId, 'rejected');
    replyText = `❌ Withdrawal ${TxId} has been rejected!`;
  }
  //Delete the original message after processing ---
    try {
      await axios.post(`${BOT_URL}/deleteMessage`, {
        chat_id: chatId,
        message_id: messageId,
      });
      logger.info(`Successfully deleted message ${messageId} in chat ${chatId}`);
    } catch (deleteError) {
      logger.error(`Failed to delete message ${messageId} in chat ${chatId}:`, deleteError.response ? deleteError.response.data : deleteError.message);
      replyText += "\n\n(Note: Could not delete original message)"; // Optional: inform user
    }
  // Send the reply message
  await axios.post(`${BOT_URL}/sendMessage`, {
    chat_id: chatId,
    text: replyText,
    parse_mode: "HTML",
  });

  return reply.code(200).send("Callback handled");
}


export async function verifierCourseRep(type, id) {
  try {
    if (type == "profile") {
      const response = await axios.post(`${BOT_URL}/sendMessage`, {
        chat_id: ADMIN_CHATID,
        text:
          `*Account Creation Attempt made\\!* \n
*${id.name}* attempted to create an Admin Account with the role ${id.role} for the department of *${id.departmentName}*, in *${id.facultyName}*\\.
The phone number is ${id.phone}\\.`,
        parse_mode: "MarkdownV2",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Approve Profile", callback_data: `adminApprove_${id.role}_${id.uid}` },
              { text: "Deny Profile", callback_data: `adminDeny_${id.role}_${id.uid}` }
            ]
          ]
        }
      });
      logger.info("Message sent successfully:", response.data);
    }
  } catch (err) {
    if (err.response) {
      logger.warn(`Error Sending Verification prompt! HTTP Status: ${err.response.status}, Data: ${JSON.stringify(err.response.data)}`, err);
    } else {
      logger.warn("Error Sending Verification prompt! : " + err.message, err);
    }
  }
}


// Utility function to escape MarkdownV2 special characters
export function escapeMarkdownV2(text) {
  if (typeof text !== 'string') {
    text = String(text); // Ensure it's a string
  }
  // List of special characters that need escaping in MarkdownV2
  const specialChars = /[_\*\[\]()~`>#+\-=|{}.!\\]/g;
  return text.replace(specialChars, '\\$&');
}

export async function adminProcessWithdrawal(withdrawalData) {
  try {
    const amount = escapeMarkdownV2(withdrawalData.amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }));
    const txId = escapeMarkdownV2(withdrawalData.TxId);
    const classInfo = escapeMarkdownV2(withdrawalData.classInfo);
    const bankName = escapeMarkdownV2(withdrawalData.accountDetails.bankName);
    const accountNumber = escapeMarkdownV2(withdrawalData.accountDetails.accountNumber);
    const accountName = escapeMarkdownV2(withdrawalData.accountDetails.accountName);
    const initiatedBy = escapeMarkdownV2(withdrawalData.initiatedBy || 'Unknown');
    const requestTime = escapeMarkdownV2(new Date().toLocaleString());


    const messageText =
      `💰 *New Withdrawal Request* 💰\n\n` +
      `▫️ *Amount:* ${amount}\n` + // NGN symbol will be handled by toLocaleString, no explicit ₦ needed here
      `▫️ *Transaction ID:* ${txId}\n` +
      `▫️ *Class:* ${classInfo}\n\n` +
      `🏦 *Bank Details:*\n` +
      `└ *Bank:* ${bankName}\n` +
      `└ *Account No:* ${accountNumber}\n` +
      `└ *Account Name:* ${accountName}\n\n` +
      `🆔 *Initiated By:* ${initiatedBy}\n` +
      `⏱ *Request Time:* ${requestTime}`;

    console.log(`Message to be sent: ${messageText}`);

    const response = await axios.post(`${BOT_URL}/sendMessage`, {
      chat_id: ADMIN_CHATID,
      text: messageText,
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Mark as Completed",
              callback_data: `withdrawalSuccess_${withdrawalData.TxId}`
            },
            {
              text: "❌ Reject Withdrawal",
              callback_data: `withdrawalReject_${withdrawalData.TxId}`
            }
          ]
        ]
      }
    });

    logger.info("Withdrawal notification sent successfully:", {
      TxId: withdrawalData.TxId,
      messageId: response.data.result.message_id
    });

    return true;
  } catch (error) {
    logger.error("Failed to send withdrawal notification:", {
      error: error.response ? error.response.data : error.message, // Log specific error data from Axios
      withdrawalData
    });
    return false;
  }
}