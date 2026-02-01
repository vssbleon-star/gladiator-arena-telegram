import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
import aiohttp
import asyncio
from datetime import datetime

# Configuration
BOT_TOKEN = os.getenv('BOT_TOKEN', 'YOUR_BOT_TOKEN_HERE')
API_URL = os.getenv('API_URL', 'https://your-render-app.onrender.com/api')
WEBAPP_URL = os.getenv('WEBAPP_URL', 'https://your-render-app.onrender.com/app')

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a message when the command /start is issued."""
    user = update.effective_user
    
    # Create inline keyboard with Web App button
    keyboard = [
        [InlineKeyboardButton("🎮 Открыть игру", web_app=WebAppInfo(url=WEBAPP_URL))],
        [
            InlineKeyboardButton("📊 Статистика", callback_data='stats'),
            InlineKeyboardButton("🏆 Рейтинг", callback_data='leaderboard')
        ],
        [
            InlineKeyboardButton("❓ Помощь", callback_data='help'),
            InlineKeyboardButton("👨‍💻 Разработчик", callback_data='developer')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    welcome_message = f"""
🏛️ *Добро пожаловать в Gladiator Arena, {user.first_name}!*

*Создайте свою школу гладиаторов и станьте легендой арены!*

⚔️ *Основные возможности:*
• Нанимайте и тренируйте гладиаторов
• Участвуйте в эпических боях
• Зарабатывайте золото и славу
• Улучшайте свою школу
• Соревнуйтесь с другими игроками

*Нажмите кнопку ниже, чтобы начать игру!*
    """
    
    await update.message.reply_text(
        welcome_message,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show player statistics."""
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/player/{user_id}") as response:
                if response.status == 200:
                    player_data = await response.json()
                    
                    game_data = player_data.get('game_data', {})
                    if isinstance(game_data, str):
                        import json
                        game_data = json.loads(game_data)
                    
                    gladiators = game_data.get('gladiators', [])
                    gladiator_count = len(gladiators)
                    
                    stats_message = f"""
📊 *Ваша статистика:*

👤 *Игрок:* {player_data.get('first_name', 'Гладиатор')}
🏅 *Уровень:* {player_data.get('level', 1)}
⭐ *Опыт:* {player_data.get('experience', 0)}/{(player_data.get('level', 1) * 500)}
💰 *Золото:* {player_data.get('gold', 0)}
💎 *Самоцветы:* {player_data.get('gems', 0)}
👑 *Слава:* {player_data.get('fame', 0)}
⚡ *Энергия:* {player_data.get('energy', 0)}/{player_data.get('max_energy', 100)}
⚔️ *Гладиаторов:* {gladiator_count}

*Последний вход:* {player_data.get('last_login', 'Сегодня')}
                    """
                    
                    keyboard = [
                        [InlineKeyboardButton("🎮 Продолжить игру", web_app=WebAppInfo(url=f"{WEBAPP_URL}?tgId={user_id}"))],
                        [InlineKeyboardButton("◀️ Назад", callback_data='back_to_main')]
                    ]
                    reply_markup = InlineKeyboardMarkup(keyboard)
                    
                    await query.edit_message_text(
                        stats_message,
                        reply_markup=reply_markup,
                        parse_mode='Markdown'
                    )
                else:
                    await query.edit_message_text(
                        "❌ Вы еще не начали игру! Нажмите кнопку ниже, чтобы создать своего первого гладиатора.",
                        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🎮 Начать игру", web_app=WebAppInfo(url=WEBAPP_URL))]])
                    )
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        await query.edit_message_text(
            "❌ Ошибка загрузки статистики. Попробуйте позже.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀️ Назад", callback_data='back_to_main')]])
        )

async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show leaderboard."""
    query = update.callback_query
    await query.answer()
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{API_URL}/leaderboard?limit=10") as response:
                if response.status == 200:
                    data = await response.json()
                    leaderboard_data = data.get('leaderboard', [])
                    
                    leaderboard_message = "🏆 *Топ 10 игроков по славе:*\n\n"
                    
                    for i, player in enumerate(leaderboard_data[:10], 1):
                        medal = ""
                        if i == 1: medal = "🥇"
                        elif i == 2: medal = "🥈"
                        elif i == 3: medal = "🥉"
                        else: medal = f"{i}."
                        
                        leaderboard_message += f"{medal} *{player.get('first_name', player.get('username', 'Игрок'))}* - {player.get('fame', 0)} славы\n"
                    
                    keyboard = [
                        [InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=WEBAPP_URL))],
                        [InlineKeyboardButton("📊 Моя статистика", callback_data='stats')],
                        [InlineKeyboardButton("◀️ Назад", callback_data='back_to_main')]
                    ]
                    reply_markup = InlineKeyboardMarkup(keyboard)
                    
                    await query.edit_message_text(
                        leaderboard_message,
                        reply_markup=reply_markup,
                        parse_mode='Markdown'
                    )
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {e}")
        await query.edit_message_text(
            "❌ Ошибка загрузки рейтинга. Попробуйте позже.",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("◀️ Назад", callback_data='back_to_main')]])
        )

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a help message."""
    query = update.callback_query
    await query.answer()
    
    help_message = """
❓ *Помощь по игре Gladiator Arena*

⚔️ *Основные команды:*
/start - Начать игру
/stats - Ваша статистика
/leaderboard - Рейтинг игроков
/help - Эта справка

🎮 *Как играть:*
1. *Начните с покупки гладиатора*
2. *Участвуйте в боях на арене*
3. *Зарабатывайте золото и опыт*
4. *Улучшайте экипировку*
5. *Покупайте новых гладиаторов*
6. *Улучшайте здания школы*

💡 *Советы:*
• Начинайте с легких боев
• Следите за здоровьем гладиаторов
• Ежедневно заходите за наградой
• Улучшайте казармы для большего количества гладиаторов

🆘 *Поддержка:*
Если у вас есть вопросы или проблемы, свяжитесь с разработчиком.
    """
    
    keyboard = [
        [InlineKeyboardButton("🎮 Начать игру", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("👨‍💻 Разработчик", callback_data='developer')],
        [InlineKeyboardButton("◀️ Назад", callback_data='back_to_main')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        help_message,
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def developer_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show developer information."""
    query = update.callback_query
    await query.answer()
    
    dev_message = """
👨‍💻 *Разработчик игры*

*Gladiator Arena* разработана с ❤️ для сообщества Telegram.

🌐 *Ссылки:*
• [GitHub](https://github.com/yourusername)
• [Telegram канал](https://t.me/yourchannel)
• [Страница с обновлениями](https://t.me/yourupdates)

💬 *Обратная связь:*
Если у вас есть предложения или вы нашли ошибку, пожалуйста, сообщите об этом через:
• Команду /feedback
• Чат поддержки

⚡ *Технологии:*
• Backend: Node.js + Express + PostgreSQL
• Frontend: HTML/CSS/JS + Telegram Web App
• Hosting: Render.com
• Database: PostgreSQL
    """
    
    keyboard = [
        [InlineKeyboardButton("🎮 Вернуться к игре", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton("📊 Статистика", callback_data='stats')],
        [InlineKeyboardButton("◀️ Назад", callback_data='back_to_main')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        dev_message,
        reply_markup=reply_markup,
        parse_mode='Markdown',
        disable_web_page_preview=True
    )

async def back_to_main(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Go back to main menu."""
    query = update.callback_query
    await query.answer()
    
    user = query.from_user
    keyboard = [
        [InlineKeyboardButton("🎮 Открыть игру", web_app=WebAppInfo(url=WEBAPP_URL))],
        [
            InlineKeyboardButton("📊 Статистика", callback_data='stats'),
            InlineKeyboardButton("🏆 Рейтинг", callback_data='leaderboard')
        ],
        [
            InlineKeyboardButton("❓ Помощь", callback_data='help'),
            InlineKeyboardButton("👨‍💻 Разработчик", callback_data='developer')
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        f"🏛️ *Gladiator Arena*\n\nПривет, {user.first_name}! Готовы к бою?",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def daily_reward(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send daily reward reminder."""
    user = update.effective_user
    
    # Check if user already got reward today
    # This is a simplified version - in production, you'd check your database
    
    keyboard = [
        [InlineKeyboardButton("🎮 Получить награду", web_app=WebAppInfo(url=f"{WEBAPP_URL}?daily=true"))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await context.bot.send_message(
        chat_id=user.id,
        text="🎁 *Ежедневная награда ждет вас!*\n\nЗаходите в игру каждый день, чтобы получать бонусы!",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def battle_notification(context: ContextTypes.DEFAULT_TYPE):
    """Send battle notifications to users."""
    # This would be called by a job queue
    # In production, you'd query your database for users who haven't played today
    
    # For now, this is a placeholder
    pass

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Log errors and send a message to the user."""
    logger.error(f"Exception while handling an update: {context.error}")
    
    if update and update.effective_user:
        await context.bot.send_message(
            chat_id=update.effective_user.id,
            text="❌ Произошла ошибка. Пожалуйста, попробуйте позже."
        )

def main():
    """Start the bot."""
    # Create the Application
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Register command handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("stats", stats))
    application.add_handler(CommandHandler("leaderboard", leaderboard))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("daily", daily_reward))
    
    # Register callback query handlers
    application.add_handler(CallbackQueryHandler(stats, pattern='^stats$'))
    application.add_handler(CallbackQueryHandler(leaderboard, pattern='^leaderboard$'))
    application.add_handler(CallbackQueryHandler(help_command, pattern='^help$'))
    application.add_handler(CallbackQueryHandler(developer_info, pattern='^developer$'))
    application.add_handler(CallbackQueryHandler(back_to_main, pattern='^back_to_main$'))
    
    # Register error handler
    application.add_error_handler(error_handler)
    
    # Set up job queue for notifications
    job_queue = application.job_queue
    
    # Daily reward reminder at 12:00 UTC
    job_queue.run_daily(daily_reward, time=datetime.time(hour=12, minute=0))
    
    # Battle notifications every 6 hours
    job_queue.run_repeating(battle_notification, interval=21600, first=10)
    
    # Start the bot
    print("🤖 Бот запущен...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()