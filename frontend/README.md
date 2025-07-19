# 🤖 AI Chat Frontend - Your Beautiful Gateway to OpenAI

Welcome to the most stunning chat interface you've ever laid eyes on! This Next.js frontend connects seamlessly to your FastAPI backend and provides a gorgeous, purple-themed chat experience with OpenAI's API. 

## ✨ Features That'll Make You Smile

- **🎨 Gorgeous UI** - Styled with your custom purple theme (#9E72C3, #924DBF, #7338A0, #4A2574, #0F0529)
- **🔐 Secure API Key Storage** - Password-masked input with local storage
- **💬 Dual Message Types** - Send both developer/system and user messages
- **📱 Responsive Design** - Looks amazing on desktop, tablet, and mobile
- **🚀 Real-time Chat** - Instant responses from OpenAI
- **🎯 Smart Environment Detection** - Works locally and in production
- **🧹 Clean & Simple** - No clutter, just pure chat goodness

## 🚀 Quick Start (Get Running in 2 Minutes!)

### Prerequisites
- Node.js 18+ (the newer, the better!)
- npm or yarn (we'll use npm in examples)
- Your awesome FastAPI backend running

### Installation

1. **Navigate to the frontend directory:**
```bash
cd frontend
```

2. **Install the magic dependencies:**
```bash
npm install
```

3. **Fire up the development server:**
```bash
npm run dev
```

4. **Open your browser and visit:**
```
http://localhost:3000
```

5. **🎉 Boom! You're ready to chat!**

## 🔧 Development Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts development server on localhost:3000 |
| `npm run build` | Builds the app for production |
| `npm run start` | Runs the production build |
| `npm run lint` | Checks your code for issues |

## 🌐 Backend Configuration

### Local Development
When running locally (localhost:3000), the frontend automatically connects to `http://localhost:8000` for your backend.

### Production Deployment
For production, you'll need to update the backend URL in `app/components/ChatInterface.tsx`:

```typescript
// Find this line around line 66:
return 'https://your-backend-url.vercel.app' // Update this!
```

Replace `https://your-backend-url.vercel.app` with your actual deployed backend URL.

## 🚀 Deploying to Vercel

### Automatic Deployment (Recommended)

1. **Push your code to GitHub**
2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Select the `frontend` folder as your root directory
   - Deploy! 🎉

### Manual Deployment

1. **Install Vercel CLI:**
```bash
npm i -g vercel
```

2. **Deploy from the frontend directory:**
```bash
cd frontend
vercel --prod
```

## 🎨 Theme Customization

Your beautiful theme colors are defined in `tailwind.config.js`:

```javascript
colors: {
  'primary': '#9E72C3',        // Main purple
  'primary-dark': '#924DBF',   // Darker purple
  'primary-darker': '#7338A0', // Even darker
  'primary-darkest': '#4A2574', // Darkest
  'background': '#0F0529',     // Deep space background
}
```

Want to tweak the colors? Just update these values and watch the magic happen!

## 🔐 Security Notes

- **API Keys**: Stored in localStorage for convenience, but never sent to our servers
- **CORS**: Backend is configured to accept requests from your frontend
- **Input Validation**: All user inputs are properly validated and sanitized

## 🐛 Troubleshooting

### "Cannot connect to backend"
- Make sure your FastAPI backend is running on port 8000
- Check if CORS is properly configured in your backend
- Verify the backend URL in production deployments

### "API Key not working"
- Double-check your OpenAI API key
- Ensure your key has sufficient credits
- Try clearing localStorage and re-entering the key

### "Build errors"
- Run `npm install` to ensure all dependencies are installed
- Check that you're using Node.js 18 or higher
- Clear `.next` folder and rebuild: `rm -rf .next && npm run build`

## 🎯 What's Next?

This frontend is designed to be simple but extensible. Some ideas for future enhancements:

- Message history persistence
- Multiple conversation threads
- File upload support
- Voice input/output
- Custom model selection
- Conversation export

## 💡 Pro Tips

- Use keyboard shortcuts: Enter to save API key, submit messages
- The chat auto-scrolls to show latest messages
- Messages are color-coded: Developer (purple), User (darker purple), Assistant (darkest purple)
- Clear chat anytime with the "Clear Chat" button
- Change API keys easily with "Change API Key" button

---

**Happy chatting! 🎉** If you run into any issues, the console logs will be your best friend for debugging.