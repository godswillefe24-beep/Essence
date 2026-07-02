# My Blog - Full Setup Guide

## 📌 Features

✅ Static blog with HTML/CSS/JavaScript  
✅ Node.js/Express backend  
✅ Comments system with database persistence  
✅ Newsletter subscription with email notifications  
✅ Analytics tracking (views, likes, subscribers)  
✅ Dark mode toggle  
✅ Responsive design  
✅ Search and filter posts

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables (recommended):**
   - Create a `.env` file from `.env.example`
   - Add your Gmail credentials (requires App Password) or other integrations
   - Set a strong admin password and a random JWT secret

   ```bash
   copy .env.example .env
   ```

3. **Start the backend server:**

   ```bash
   npm start
   ```

   Server runs on `http://localhost:3001` by default (or the port from your `PORT` environment variable).

4. **Open in browser:**
   - Navigate to your local blog URL in your browser

### Development Mode

Run the server in watch mode (auto-restarts on changes):

```bash
npm run dev
```

## 📁 Project Structure

```
my-blog/
├── index.html              # Homepage
├── script.js               # Frontend JavaScript
├── styles.css              # Styling
├── server.js               # Express backend
├── posts/
│   ├── post1.html         # Welcome post
│   ├── post2.html         # Technology news
│   ├── post3.html         # Getting started
│   └── post4.html         # Advanced customization
├── data/                   # JSON database (auto-created)
│   ├── comments.json
│   ├── analytics.json
│   └── subscribers.json
├── package.json
├── .env.example
└── README.md
```

## 🔧 API Endpoints

### Comments

- `GET /api/comments/:postId` - Get comments for a post
- `POST /api/comments` - Post new comment
  ```json
  { "postId": "1", "name": "John", "text": "Great post!" }
  ```

### Analytics

- `GET /api/analytics` - Get blog analytics
- `POST /api/analytics/view/:postId` - Record post view
- `POST /api/analytics/like` - Record a like

### Subscribe

- `POST /api/subscribe` - Subscribe to newsletter
  ```json
  { "email": "user@example.com" }
  ```

## 📧 Email Configuration

Email notifications require Gmail:

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Add credentials to `.env`
4. Restart the server

If email isn't configured, subscriptions still work - they just won't send confirmation emails.

## 🗄️ Database

The app uses JSON files for data storage in the `data/` directory:

- `comments.json` - All comments by post
- `analytics.json` - Views, likes, total comments
- `subscribers.json` - Email list

Data persists between server restarts.

## 🎨 Frontend Features

- **Dark Mode:** Toggle button in top-right
- **Search:** Filter posts by title or content
- **Comments:** Leave comments on featured post
- **Subscribe:** Newsletter signup
- **Responsive:** Works on mobile, tablet, desktop
- **Share:** Social sharing buttons

## 🌐 Deployment

### Static Hosting (Netlify, Vercel, GitHub Pages)

The frontend works as static HTML. Just upload `index.html`, `styles.css`, and `posts/` folder.

### Full Stack Deployment (with backend)

**Heroku Example:**

```bash
heroku create my-blog
git push heroku main
```

**Railway, Render, or other platforms:**

1. Push code to Git repository
2. Connect to deployment platform
3. Set environment variables (EMAIL_USER, EMAIL_PASSWORD)
4. Deploy

## 🔒 Security Notes

- Email credentials should never be in version control (use .env)
- Comments are stored server-side
- No authentication required (future enhancement)
- Input is HTML-escaped to prevent XSS

## 📝 Customization

- Edit `index.html` to change layout
- Edit `styles.css` for colors and fonts
- Edit `server.js` to modify API behavior
- Add more posts in the `posts/` directory

## 🐛 Troubleshooting

**"Cannot find module 'express'"**

```bash
npm install
```

**"API not available" in browser**

- Make sure server is running: `npm start`
- Check your local blog URL loads
- Check browser console for CORS errors

**Email not sending**

- Check `.env` configuration
- Verify Gmail App Password (not regular password)
- Check spam folder

**Port 3001 already in use**
Edit server.js:

```javascript
const PORT = 3002; // Change to another port
```

## 📚 Next Steps

- Add user authentication
- Create admin dashboard
- Add image uploads
- Implement email templates
- Add category pages
- SEO optimization

## 📄 License

MIT

---

Built with ❤️ by Efe
