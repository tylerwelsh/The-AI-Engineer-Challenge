import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata = {
  title: 'Tyler\'s AI Chat Interface',
  description: 'A beautiful chat interface for OpenAI API',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-background min-h-screen">
        {children}
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#4A2574',
              color: '#ffffff',
              border: '1px solid #9E72C3',
            },
            success: {
              style: {
                background: '#7338A0',
              },
            },
            error: {
              style: {
                background: '#924DBF',
              },
            },
          }}
        />
      </body>
    </html>
  )
} 