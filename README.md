# TaxWizard AI

TaxWizard AI is a smart, AI-powered tax calculator and investment planner designed specifically for Indian taxpayers. It helps users effortlessly compare the Old and New tax regimes, extract financial data directly from their Form 16 documents, and receive personalized investment advice to optimize their tax savings.

## 🚀 Features

*   **AI-Powered Form 16 Parsing:** Upload your Form 16 (PDF or Image), and our Gemini AI integration will automatically extract your Gross Salary, Section 80C, Section 80D, Section 24 (Home Loan), Section 80E (Education Loan), HRA, and NPS deductions.
*   **Live Tax Preview:** See your potential tax liability and savings update in real-time as you adjust your income and deduction values.
*   **Old vs. New Regime Comparison:** Visually compare your tax breakdown under both regimes using interactive charts to make an informed decision.
*   **Personalized Investment Advice:** Select your risk profile (Conservative, Moderate, or Aggressive) and get a custom, AI-generated financial roadmap to maximize your wealth and minimize taxes.
*   **Secure Authentication & Cloud Storage:** Log in securely with Google. Your financial profiles are saved to Firebase Firestore so you can pick up where you left off.
*   **Export to PDF:** Download your personalized investment plan as a clean, print-ready PDF.

## 🛠️ Tech Stack

*   **Frontend:** React 18, TypeScript, Vite
*   **Styling:** Tailwind CSS, Lucide React (Icons)
*   **Animations:** Motion (Framer Motion)
*   **Charts:** Recharts
*   **Backend / BaaS:** Firebase (Authentication, Firestore)
*   **AI Integration:** Google Gemini API (`@google/genai`)

## 📦 Getting Started

### Prerequisites

*   Node.js (v18 or higher)
*   A Firebase Project (with Google Auth and Firestore enabled)
*   A Google Gemini API Key

### Installation

1.  **Clone the repository** (if applicable) or download the source code.
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up Environment Variables:**
    Create a `.env` file in the root directory and add your Gemini API key:
    ```env
    GEMINI_API_KEY=your_gemini_api_key_here
    ```
    *(Note: In the AI Studio environment, this is handled automatically via `process.env.GEMINI_API_KEY`)*
4.  **Firebase Configuration:**
    Ensure your `src/firebase.ts` or `firebase-applet-config.json` is correctly configured with your Firebase project credentials.
5.  **Start the Development Server:**
    ```bash
    npm run dev
    ```
6.  Open your browser and navigate to `http://localhost:3000`.

## 🔒 Security & Privacy

*   **Data Storage:** User profiles and deduction preferences are stored securely in Firestore, linked to the user's authenticated Google account.
*   **Form 16 Processing:** Documents uploaded for parsing are processed ephemerally via the Gemini API to extract data and are not permanently stored by the application.

## 📄 License

This project is licensed under the Apache 2.0 License.
