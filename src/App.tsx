/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  Calculator, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  LogOut, 
  Upload, 
  Camera,
  ChevronRight,
  Info,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  Lightbulb,
  Calendar,
  PieChart as PieChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { calculateTax, TaxResult } from './lib/tax-logic';
import { parseForm16, getInvestmentAdvice } from './lib/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import html2pdf from 'html2pdf.js';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { Chatbot } from './components/Chatbot';

import { useStep, Step } from './context/StepContext';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { step, setStep, transition } = useStep();
  const [scanning, setScanning] = useState(false);
  const [uploadedFilePreview, setUploadedFilePreview] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>('');
  
  // Tax Data State
  const [incomeSources, setIncomeSources] = useState({
    salary: 1200000,
    houseProperty: 0,
    capitalGains: 0,
    businessIncome: 0,
    otherIncome: 0
  });
  const [deductions, setDeductions] = useState({
    section80C: 150000,
    section80D: 25000,
    section24: 0,
    section80E: 0,
    hra: 0,
    nps: 0,
    other: 0
  });
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [advice, setAdvice] = useState<string>('');
  const [generatingAdvice, setGeneratingAdvice] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Data Loss Prevention Warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasIncome = Object.values(incomeSources).some(v => v > 0);
      const hasDeductions = Object.values(deductions).some(v => v > 0);
      
      if (hasIncome || hasDeductions) {
        e.preventDefault();
        e.returnValue = ''; // Standard browser warning
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [incomeSources, deductions]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        loadUserProfile(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadUserProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'userProfiles', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIncomeSources({
          salary: data.incomeSources?.salary ?? data.salary ?? 1200000,
          houseProperty: data.incomeSources?.houseProperty ?? 0,
          capitalGains: data.incomeSources?.capitalGains ?? 0,
          businessIncome: data.incomeSources?.businessIncome ?? 0,
          otherIncome: data.incomeSources?.otherIncome ?? 0
        });
        setDeductions({
          section80C: data.deductions?.section80C ?? 150000,
          section80D: data.deductions?.section80D ?? 25000,
          section24: data.deductions?.section24 ?? 0,
          section80E: data.deductions?.section80E ?? 0,
          hra: data.deductions?.hra ?? 0,
          nps: data.deductions?.nps ?? 0,
          other: data.deductions?.other ?? 0
        });
        setRiskProfile(data.riskProfile || 'moderate');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `userProfiles/${uid}`);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const totalIncome = Object.values(incomeSources).reduce((acc, val) => acc + (Number(val) || 0), 0);
    try {
      await setDoc(doc(db, 'userProfiles', user.uid), {
        salary: totalIncome,
        incomeSources,
        deductions,
        riskProfile,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `userProfiles/${user.uid}`);
    }
  };

  const [activeSlab, setActiveSlab] = useState<{regime: string, index: number} | null>(null);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        console.log('User closed the login popup');
      } else {
        console.error("Login failed:", err);
      }
    }
  };

  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setScanStatus('Reading file...');
    setUploadedFileType(file.type);
    
    // Create a preview URL for the file
    const objectUrl = URL.createObjectURL(file);
    setUploadedFilePreview(objectUrl);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      try {
        setScanStatus('Extracting financial data with AI...');
        const data = await parseForm16(base64);
        setScanStatus('Processing results...');
        setIncomeSources(prev => ({ ...prev, salary: data.grossSalary || prev.salary }));
        setDeductions({
          ...deductions,
          section80C: data.section80C || deductions.section80C,
          section80D: data.section80D || deductions.section80D,
          section24: data.section24 || deductions.section24,
          section80E: data.section80E || deductions.section80E,
          hra: data.hra || deductions.hra,
          nps: data.nps || deductions.nps
        });
        transition('SCAN_COMPLETE');
      } catch (err) {
        console.error("Scan failed:", err);
        alert("Could not parse Form 16. Please enter details manually.");
      } finally {
        setScanning(false);
        setScanStatus('');
      }
    };
    reader.readAsDataURL(file);
  };

  const totalIncome = Object.values(incomeSources).reduce((acc, val) => acc + (Number(val) || 0), 0);
  const oldRegime = calculateTax(incomeSources, deductions, 'old');
  const newRegime = calculateTax(incomeSources, deductions, 'new');
  const betterRegime = oldRegime.totalTax < newRegime.totalTax ? 'old' : 'new';
  const savings = Math.abs(oldRegime.totalTax - newRegime.totalTax);

  const deductionChartData = [
    {
      name: 'Old',
      'Taxable Income': oldRegime.taxableIncome,
      'Std Ded': oldRegime.standardDeduction,
      '80C': oldRegime.appliedDeductions.section80C,
      '80D': oldRegime.appliedDeductions.section80D,
      'Sec 24': oldRegime.appliedDeductions.section24,
      'Other': oldRegime.appliedDeductions.section80E + oldRegime.appliedDeductions.nps + oldRegime.appliedDeductions.hra + oldRegime.appliedDeductions.other
    },
    {
      name: 'New',
      'Taxable Income': newRegime.taxableIncome,
      'Std Ded': newRegime.standardDeduction,
      '80C': 0,
      '80D': 0,
      'Sec 24': 0,
      'Other': 0
    }
  ];

  const generateAdvice = async () => {
    setGeneratingAdvice(true);
    try {
      const result = await getInvestmentAdvice({
        salary: totalIncome,
        incomeSources,
        deductions,
        riskProfile
      });
      setAdvice(result);
      transition('GET_ADVICE');
    } catch (err) {
      console.error("Advice generation failed:", err);
    } finally {
      setGeneratingAdvice(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloadingPdf(true);
    // Give React a moment to render the spinner
    await new Promise(resolve => setTimeout(resolve, 100));

    const element = document.getElementById('pdf-export-container');
    if (!element) {
      setIsDownloadingPdf(false);
      return;
    }
    
    const opt = {
      margin:       10,
      filename:     'TaxWizard_Investment_Plan.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, windowWidth: 800 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };
    
    try {
      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error("PDF generation failed", error);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0052CC]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#172B4D] font-sans">
      {/* Navigation */}
      <nav className="bg-white border-b border-[#DFE1E6] px-6 py-4 flex justify-between items-center sticky top-0 z-50 no-print">
        <div className="flex items-center gap-2">
          <div className="bg-[#0052CC] p-2 rounded-lg">
            <Calculator className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#0052CC]">TaxWizard AI</span>
        </div>
        {user ? (
          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-[#6B778C]">{user.email}</p>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="p-2 hover:bg-[#EBECF0] rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5 text-[#6B778C]" />
            </button>
          </div>
        ) : (
          <button 
            onClick={handleLogin}
            className="bg-[#0052CC] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#0747A6] transition-all"
          >
            Sign In
          </button>
        )}
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 py-20"
            >
              <h1 className="text-5xl font-extrabold text-[#091E42] leading-tight">
                Stop Guessing. <br />
                <span className="text-[#0052CC]">Start Saving.</span>
              </h1>
              <p className="text-xl text-[#6B778C] max-w-2xl mx-auto">
                95% of Indians don't have a financial plan. We're changing that. 
                Get expert tax advice and investment plans in seconds.
              </p>
              <div className="flex flex-col md:flex-row gap-4 justify-center pt-8">
                <button 
                  onClick={handleLogin}
                  className="bg-[#0052CC] text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                >
                  Get Started Free <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-20">
                {[
                  { icon: FileText, title: "Form 16 Scan", desc: "Upload your Form 16 and let AI do the heavy lifting." },
                  { icon: ArrowRightLeft, title: "Regime Compare", desc: "Old vs New? We calculate the exact savings for you." },
                  { icon: TrendingUp, title: "Smart Investing", desc: "Personalized tax-saving plans based on your risk profile." }
                ].map((feature, i) => (
                  <div key={i} className="bg-white p-8 rounded-2xl border border-[#DFE1E6] text-left space-y-4">
                    <div className="bg-[#E6EFFC] p-3 rounded-xl w-fit">
                      <feature.icon className="text-[#0052CC] w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold">{feature.title}</h3>
                    <p className="text-[#6B778C] text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-8">
              {/* Progress Bar */}
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#DFE1E6] mb-8 no-print">
                {[
                  { id: 'input', label: 'Income Details', icon: FileText },
                  { id: 'comparison', label: 'Tax Analysis', icon: PieChartIcon },
                  { id: 'advice', label: 'Investment Plan', icon: TrendingUp }
                ].map((s, i) => (
                  <div 
                    key={s.id} 
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setStep(s.id as Step)}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all",
                      step === s.id ? "bg-[#0052CC] text-white scale-110" : "bg-[#EBECF0] text-[#6B778C]"
                    )}>
                      {i + 1}
                    </div>
                    <span className={cn(
                      "hidden md:block font-medium",
                      step === s.id ? "text-[#0052CC]" : "text-[#6B778C]"
                    )}>{s.label}</span>
                    {i < 2 && <div className="hidden md:block w-12 h-[2px] bg-[#DFE1E6] mx-2" />}
                  </div>
                ))}
              </div>

              {step === 'welcome' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn("grid gap-8", scanning ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}
                >
                  {scanning ? (
                    <div className="bg-white p-10 rounded-3xl border border-[#DFE1E6] flex flex-col md:flex-row items-center gap-10 shadow-sm">
                      {uploadedFilePreview && (
                        <div className="w-full md:w-1/2 h-80 bg-[#F4F5F7] rounded-2xl border border-[#DFE1E6] overflow-hidden flex items-center justify-center relative">
                          {uploadedFileType?.includes('pdf') ? (
                            <iframe src={`${uploadedFilePreview}#toolbar=0&navpanes=0`} className="w-full h-full opacity-60" title="PDF Preview" />
                          ) : (
                            <img src={uploadedFilePreview} alt="Document Preview" className="max-h-full object-contain opacity-60" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-transparent to-transparent flex items-end justify-center pb-8">
                            <div className="w-3/4 h-3 bg-[#DFE1E6] rounded-full overflow-hidden shadow-inner">
                              <motion.div 
                                className="h-full bg-[#0052CC]"
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-6 w-full md:w-1/2">
                        <div className="bg-[#E6EFFC] p-5 rounded-full">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-[#0052CC]"></div>
                        </div>
                        <div>
                          <h2 className="text-3xl font-bold text-[#091E42] mb-2">Analyzing Document</h2>
                          <p className="text-[#0052CC] text-xl font-medium animate-pulse">{scanStatus}</p>
                        </div>
                        <p className="text-base text-[#6B778C] max-w-sm leading-relaxed">
                          Our AI is extracting your gross salary, 80C, 80D, and other deductions to build your profile. This usually takes a few seconds.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-white p-10 rounded-3xl border-2 border-dashed border-[#DFE1E6] flex flex-col items-center justify-center text-center space-y-6 hover:border-[#0052CC] transition-colors group">
                        <div className="bg-[#E6EFFC] p-6 rounded-full group-hover:scale-110 transition-transform">
                          <Upload className="w-12 h-12 text-[#0052CC]" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold">Upload Form 16</h2>
                          <p className="text-[#6B778C] mt-2">Upload your PDF or Image and we'll extract everything.</p>
                        </div>
                        <label className="bg-[#0052CC] text-white px-8 py-3 rounded-xl font-bold cursor-pointer hover:bg-[#0747A6] transition-all">
                          Select File
                          <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf" />
                        </label>
                      </div>

                      <div className="bg-white p-10 rounded-3xl border border-[#DFE1E6] flex flex-col items-center justify-center text-center space-y-6">
                        <div className="bg-[#E6EFFC] p-6 rounded-full">
                          <Calculator className="w-12 h-12 text-[#0052CC]" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold">Manual Entry</h2>
                          <p className="text-[#6B778C] mt-2">I'll enter my salary and deductions myself.</p>
                        </div>
                        <button 
                          onClick={() => transition('START')}
                          className="bg-white border-2 border-[#0052CC] text-[#0052CC] px-8 py-3 rounded-xl font-bold hover:bg-[#F4F5F7] transition-all"
                        >
                          Enter Manually
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {step === 'input' && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                >
                  <div className="lg:col-span-2 bg-white rounded-3xl border border-[#DFE1E6] overflow-hidden shadow-sm">
                    <div className="p-8 border-b border-[#DFE1E6] bg-[#F4F5F7]">
                      <h2 className="text-2xl font-bold">Financial Profile</h2>
                      <p className="text-[#6B778C]">Update your numbers for a precise calculation.</p>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-6">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Info className="w-5 h-5 text-[#0052CC]" /> Income Details
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-bold mb-1">Income from Salary (₹)</label>
                            <input 
                              type="number" 
                              value={Number.isNaN(incomeSources.salary) ? '' : incomeSources.salary}
                              onChange={(e) => setIncomeSources({ ...incomeSources, salary: e.target.value === '' ? 0 : Number(e.target.value) })}
                              className="w-full p-3 bg-[#F4F5F7] border-none rounded-lg focus:ring-2 focus:ring-[#0052CC] font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold mb-1">Income from House Property (₹)</label>
                            <input 
                              type="number" 
                              value={Number.isNaN(incomeSources.houseProperty) ? '' : incomeSources.houseProperty}
                              onChange={(e) => setIncomeSources({ ...incomeSources, houseProperty: e.target.value === '' ? 0 : Number(e.target.value) })}
                              className="w-full p-3 bg-[#F4F5F7] border-none rounded-lg focus:ring-2 focus:ring-[#0052CC] font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold mb-1">Capital Gains (₹)</label>
                            <input 
                              type="number" 
                              value={Number.isNaN(incomeSources.capitalGains) ? '' : incomeSources.capitalGains}
                              onChange={(e) => setIncomeSources({ ...incomeSources, capitalGains: e.target.value === '' ? 0 : Number(e.target.value) })}
                              className="w-full p-3 bg-[#F4F5F7] border-none rounded-lg focus:ring-2 focus:ring-[#0052CC] font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold mb-1">Business/Professional Income (₹)</label>
                            <input 
                              type="number" 
                              value={Number.isNaN(incomeSources.businessIncome) ? '' : incomeSources.businessIncome}
                              onChange={(e) => setIncomeSources({ ...incomeSources, businessIncome: e.target.value === '' ? 0 : Number(e.target.value) })}
                              className="w-full p-3 bg-[#F4F5F7] border-none rounded-lg focus:ring-2 focus:ring-[#0052CC] font-medium"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-bold mb-1">Income from Other Sources (₹)</label>
                            <input 
                              type="number" 
                              value={Number.isNaN(incomeSources.otherIncome) ? '' : incomeSources.otherIncome}
                              onChange={(e) => setIncomeSources({ ...incomeSources, otherIncome: e.target.value === '' ? 0 : Number(e.target.value) })}
                              className="w-full p-3 bg-[#F4F5F7] border-none rounded-lg focus:ring-2 focus:ring-[#0052CC] font-medium"
                            />
                          </div>
                          <div className="pt-2 border-t border-[#DFE1E6]">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-[#6B778C]">Total Gross Income</span>
                              <span className="text-xl font-black text-[#0052CC]">₹{totalIncome.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="bg-[#E6EFFC] p-4 rounded-xl flex gap-3">
                            <AlertCircle className="text-[#0052CC] w-5 h-5 shrink-0" />
                            <p className="text-xs text-[#0052CC] leading-relaxed">
                              Standard deduction of ₹75,000 (New) or ₹50,000 (Old) is applied automatically to Salary income.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-[#36B37E]" /> Deductions (Old Regime)
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                          {[
                            { key: 'section80C', label: 'Section 80C', sub: 'PPF, ELSS, LIC', max: 150000, help: "Investments in PPF, ELSS, Life Insurance, etc." },
                            { key: 'section80D', label: 'Section 80D', sub: 'Health Insurance', max: 75000, help: "Premiums for self (25k) & parents (50k)." },
                            { key: 'section24', label: 'Section 24', sub: 'Home Loan Interest', max: 200000, help: "Interest on self-occupied property." },
                            { key: 'section80E', label: 'Section 80E', sub: 'Education Loan', max: null, help: "Interest on higher education loan." },
                            { key: 'nps', label: 'Section 80CCD', sub: 'NPS (Tier 1)', max: 50000, help: "Additional NPS contribution." },
                            { key: 'hra', label: 'HRA Exemption', sub: 'House Rent', max: null, help: "Exemption based on rent paid." }
                          ].map((d) => (
                            <div key={d.key} className="group relative">
                              <div className="flex justify-between items-end mb-1">
                                <label className="block text-xs font-bold text-[#6B778C] uppercase tracking-wider">
                                  {d.label} <span className="text-[10px] font-normal lowercase">({d.sub})</span>
                                </label>
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 -top-6 bg-[#172B4D] text-white text-[10px] px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap">
                                  {d.help}
                                </div>
                              </div>
                              <input 
                                type="number" 
                                value={Number.isNaN(deductions[d.key as keyof typeof deductions]) ? '' : deductions[d.key as keyof typeof deductions]}
                                onChange={(e) => setDeductions({ ...deductions, [d.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                                className="w-full p-3 bg-[#F4F5F7] border-none rounded-lg focus:ring-2 focus:ring-[#36B37E] font-medium"
                              />
                              {d.max && (
                                <div className="mt-1 flex justify-between text-[10px]">
                                  <span className="text-[#6B778C]">Max Limit: ₹{d.max.toLocaleString()}</span>
                                  {deductions[d.key as keyof typeof deductions] > d.max && (
                                    <span className="text-[#FF5630] font-bold">Limit Exceeded</span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live Preview Sidebar */}
                  <div className="lg:col-span-1">
                    <div className="sticky top-24 bg-[#091E42] text-white rounded-3xl p-8 shadow-xl space-y-6">
                      <h3 className="text-xl font-bold border-b border-white/20 pb-4">Live Tax Preview</h3>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-white/70">Old Regime Tax</span>
                          <span className="font-mono font-bold">₹{Math.round(oldRegime.totalTax).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-white/70">New Regime Tax</span>
                          <span className="font-mono font-bold">₹{Math.round(newRegime.totalTax).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="bg-white/10 p-4 rounded-xl">
                        <p className="text-sm text-white/80 mb-1">Potential Savings</p>
                        <p className="text-3xl font-black text-[#36B37E]">₹{savings.toLocaleString()}</p>
                      </div>

                      <div className="h-48 mt-4">
                        <p className="text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">Income Breakdown</p>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deductionChartData} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                            <Tooltip 
                              cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                              contentStyle={{ backgroundColor: '#172B4D', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                              itemStyle={{ color: '#fff', fontSize: '12px' }}
                            />
                            <Bar dataKey="Taxable Income" stackId="a" fill="#36B37E" />
                            <Bar dataKey="Std Ded" stackId="a" fill="#FFAB00" />
                            <Bar dataKey="80C" stackId="a" fill="#0052CC" />
                            <Bar dataKey="80D" stackId="a" fill="#6554C0" />
                            <Bar dataKey="Sec 24" stackId="a" fill="#00B8D9" />
                            <Bar dataKey="Other" stackId="a" fill="#FF5630" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <button 
                        onClick={() => { saveProfile(); transition('VIEW_ANALYSIS'); }}
                        className="w-full bg-[#0052CC] text-white py-4 rounded-xl font-bold shadow-lg hover:bg-[#0747A6] transition-all flex justify-center items-center gap-2"
                      >
                        View Detailed Analysis <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'comparison' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-8"
                >
                  {/* Verdict Card */}
                  <div className={cn(
                    "p-8 rounded-3xl border-2 flex flex-col md:flex-row items-center justify-between gap-6",
                    betterRegime === 'new' ? "bg-[#E3FCEF] border-[#36B37E]" : "bg-[#E6EFFC] border-[#0052CC]"
                  )}>
                    <div className="flex items-center gap-6">
                      <div className={cn(
                        "p-4 rounded-2xl",
                        betterRegime === 'new' ? "bg-[#36B37E] text-white" : "bg-[#0052CC] text-white"
                      )}>
                        <CheckCircle2 className="w-10 h-10" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-black">
                          Go with {betterRegime === 'new' ? 'New' : 'Old'} Regime
                        </h2>
                        <p className="text-lg opacity-80">
                          You'll save <span className="font-bold">₹{savings.toLocaleString()}</span> per year.
                        </p>
                      </div>
                    </div>
                    <div className="bg-white/50 backdrop-blur-sm px-6 py-4 rounded-2xl text-center min-w-[200px]">
                      <p className="text-xs font-bold uppercase tracking-widest opacity-60">Total Tax Payable</p>
                      <p className="text-4xl font-black">₹{Math.min(oldRegime.totalTax, newRegime.totalTax).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Quick Edit Section */}
                  <div className="bg-white p-6 rounded-2xl border border-[#DFE1E6] flex flex-col md:flex-row items-center gap-6 shadow-sm no-print">
                    <div className="flex-1 w-full">
                      <label className="block text-xs font-bold text-[#6B778C] uppercase mb-2">Quick Edit: Salary Income (₹)</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6B778C] font-bold">₹</span>
                        <input 
                          type="number" 
                          value={incomeSources.salary || ''}
                          onChange={(e) => setIncomeSources({ ...incomeSources, salary: e.target.value === '' ? 0 : Number(e.target.value) })}
                          placeholder="Enter salary..."
                          className="w-full pl-10 pr-4 py-3 bg-[#F4F5F7] border-2 border-transparent focus:border-[#0052CC] rounded-xl font-bold text-lg transition-all outline-none"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          <span className="w-2 h-2 bg-[#36B37E] rounded-full animate-pulse"></span>
                          <span className="text-[10px] font-bold text-[#36B37E] uppercase">Live</span>
                        </div>
                      </div>
                    </div>
                    <div className="hidden md:block w-px h-12 bg-[#DFE1E6]"></div>
                    <button 
                      onClick={() => transition('GO_BACK')}
                      className="text-[#0052CC] font-bold text-sm hover:underline flex items-center gap-1"
                    >
                      Edit Deductions <ArrowRightLeft className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Calculation Summary */}
                  <div className="bg-white p-8 rounded-3xl border border-[#DFE1E6] shadow-sm">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <Calculator className="w-6 h-6 text-[#0052CC]" /> How we calculated your taxable income
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-4">
                        <p className="font-bold text-[#0052CC] border-b pb-2">Old Regime</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><span>Gross Total Income</span> <span className="font-mono">₹{totalIncome.toLocaleString()}</span></div>
                          <div className="flex justify-between text-[#FF5630]"><span>Standard Deduction (Salary)</span> <span className="font-mono">-₹{oldRegime.standardDeduction.toLocaleString()}</span></div>
                          <div className="flex justify-between text-[#FF5630]">
                            <span>Total Applied Deductions</span> 
                            <span className="font-mono">-₹{oldRegime.appliedDeductions.total.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t font-bold text-lg"><span>Taxable Income</span> <span className="font-mono">₹{oldRegime.taxableIncome.toLocaleString()}</span></div>
                          {oldRegime.taxableIncome <= 500000 && <p className="text-[10px] text-[#36B37E] font-bold">Eligible for ₹12,500 Rebate (Tax = 0)</p>}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <p className="font-bold text-[#0052CC] border-b pb-2">New Regime</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between"><span>Gross Total Income</span> <span className="font-mono">₹{totalIncome.toLocaleString()}</span></div>
                          <div className="flex justify-between text-[#FF5630]"><span>Standard Deduction (Salary)</span> <span className="font-mono">-₹{newRegime.standardDeduction.toLocaleString()}</span></div>
                          <div className="flex justify-between text-[#6B778C]"><span>Deductions</span> <span className="font-mono">Not Allowed</span></div>
                          <div className="flex justify-between pt-2 border-t font-bold text-lg"><span>Taxable Income</span> <span className="font-mono">₹{newRegime.taxableIncome.toLocaleString()}</span></div>
                          {newRegime.taxableIncome <= 700000 ? (
                            <div className="bg-[#E3FCEF] p-2 rounded mt-2">
                              <p className="text-[10px] text-[#006644] font-bold">✓ Taxable Income ≤ ₹7L</p>
                              <p className="text-[10px] text-[#006644]">Full Rebate Applied (Tax = ₹0)</p>
                            </div>
                          ) : newRegime.taxableIncome <= 722222 ? (
                            <div className="bg-[#E3FCEF] p-2 rounded mt-2">
                              <p className="text-[10px] text-[#006644] font-bold">✓ Marginal Relief Applied</p>
                              <p className="text-[10px] text-[#006644]">Tax capped at excess over ₹7L</p>
                            </div>
                          ) : (
                            <div className="bg-[#FFEBE6] p-2 rounded mt-2">
                              <p className="text-[10px] text-[#BF2600] font-bold">✗ Taxable Income &gt; ₹7L</p>
                              <p className="text-[10px] text-[#BF2600]">Rebate Lost. Tax calculated on slabs.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Charts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white p-8 rounded-3xl border border-[#DFE1E6]">
                      <h3 className="text-lg font-bold mb-6">Tax Comparison</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { name: 'Old Regime', tax: Math.round(oldRegime.totalTax) },
                            { name: 'New Regime', tax: Math.round(newRegime.totalTax) }
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <Tooltip 
                              cursor={{ fill: '#F4F5F7' }}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="tax" radius={[8, 8, 0, 0]}>
                              { [0, 1].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index === (betterRegime === 'old' ? 0 : 1) ? '#36B37E' : '#DFE1E6'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-[#DFE1E6]">
                      <h3 className="text-lg font-bold mb-6">Tax Breakdown ({betterRegime === 'new' ? 'New' : 'Old'})</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Taxable Income', value: (betterRegime === 'new' ? newRegime : oldRegime).taxableIncome },
                                { name: 'Tax Paid', value: (betterRegime === 'new' ? newRegime : oldRegime).totalTax }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              <Cell fill="#0052CC" />
                              <Cell fill="#FF5630" />
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Slab Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {[
                      { title: 'Old Regime Slabs', data: oldRegime },
                      { title: 'New Regime Slabs', data: newRegime }
                    ].map((regime, idx) => (
                      <div key={idx} className="bg-white p-8 rounded-3xl border border-[#DFE1E6]">
                        <h3 className="text-lg font-bold mb-6">{regime.title}</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-[#DFE1E6] text-[#6B778C]">
                                <th className="pb-3 font-medium">Tax Rate</th>
                                <th className="pb-3 font-medium text-right">Amount Taxed</th>
                                <th className="pb-3 font-medium text-right">Tax</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#DFE1E6]">
                              {regime.data.slabs.map((slab, i) => (
                                <tr 
                                  key={i}
                                  onMouseEnter={() => setActiveSlab({ regime: regime.title, index: i })}
                                  onMouseLeave={() => setActiveSlab(null)}
                                  className={cn(
                                    "transition-colors cursor-help relative group",
                                    activeSlab?.regime === regime.title && activeSlab?.index === i ? "bg-[#E6EFFC]" : "hover:bg-[#F4F5F7]"
                                  )}
                                >
                                  <td className="py-3 font-medium">
                                    {slab.rate}%
                                    {activeSlab?.regime === regime.title && activeSlab?.index === i && (
                                      <div className="absolute left-0 top-full z-10 w-64 p-4 bg-[#172B4D] text-white rounded-xl shadow-xl mt-1 text-xs animate-in fade-in slide-in-from-top-2">
                                        <p className="font-bold mb-1">Slab: {slab.range}</p>
                                        <p className="opacity-80 mb-2">Income in this slab: ₹{Math.round(slab.amount).toLocaleString()}</p>
                                        <div className="h-px bg-white/20 my-2"></div>
                                        <p className="font-bold">Calculation:</p>
                                        <p className="opacity-80">{slab.rate}% of ₹{Math.round(slab.amount).toLocaleString()} = ₹{Math.round(slab.tax).toLocaleString()}</p>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 text-right font-mono">₹{Math.round(slab.amount).toLocaleString()}</td>
                                  <td className="py-3 text-right font-mono">₹{Math.round(slab.tax).toLocaleString()}</td>
                                </tr>
                              ))}
                              <tr className="bg-[#F4F5F7] font-bold">
                                <td className="py-3 px-2 rounded-l-lg">Gross Tax</td>
                                <td className="py-3 text-right"></td>
                                <td className="py-3 px-2 text-right rounded-r-lg font-mono">
                                  ₹{Math.round(regime.data.slabs.reduce((acc, s) => acc + s.tax, 0)).toLocaleString()}
                                </td>
                              </tr>
                              {regime.data.rebate > 0 && (
                                <tr className="text-[#36B37E]">
                                  <td className="py-3">
                                    {regime.title.includes('New') && regime.data.taxableIncome > 700000 
                                      ? 'Marginal Relief (Sec 87A)' 
                                      : 'Rebate 87A'}
                                  </td>
                                  <td className="py-3 text-right"></td>
                                  <td className="py-3 text-right font-mono">-₹{Math.round(regime.data.rebate).toLocaleString()}</td>
                                </tr>
                              )}
                              {regime.data.cess > 0 && (
                                <tr>
                                  <td className="py-3">Health & Edu Cess (4%)</td>
                                  <td className="py-3 text-right"></td>
                                  <td className="py-3 text-right font-mono">+₹{Math.round(regime.data.cess).toLocaleString()}</td>
                                </tr>
                              )}
                              <tr className="border-t-2 border-[#172B4D] font-black text-base">
                                <td className="py-4">Final Tax</td>
                                <td className="py-4 text-right"></td>
                                <td className="py-4 text-right font-mono text-[#0052CC]">
                                  ₹{Math.round(regime.data.totalTax).toLocaleString()}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tax Tip / Explanation */}
                  <div className="bg-[#FFFAE6] p-6 rounded-2xl border border-[#FFAB00] flex gap-4">
                    <Info className="text-[#FFAB00] w-6 h-6 shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-[#7A5211]">Why the difference?</h4>
                      <p className="text-sm text-[#7A5211] leading-relaxed">
                        The <strong>Old Regime</strong> allows many deductions (80C, 80D, HRA, etc.) which can bring your taxable income down to ₹5 Lakhs, qualifying you for a full rebate (₹0 tax). 
                        The <strong>New Regime</strong> has lower tax rates and a higher rebate threshold (₹7 Lakhs), but doesn't allow most deductions. 
                        If your deductions are high, the Old Regime might be better even with higher base rates.
                      </p>
                    </div>
                  </div>

                  {/* Risk Profile Selector */}
                  <div className="bg-white p-8 rounded-3xl border border-[#DFE1E6] space-y-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-bold">Investment Strategy</h3>
                        <p className="text-[#6B778C]">Select your risk appetite for a personalized plan.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {(['conservative', 'moderate', 'aggressive'] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setRiskProfile(r)}
                          className={cn(
                            "p-6 rounded-2xl border-2 transition-all text-center space-y-2",
                            riskProfile === r 
                              ? "bg-[#E6EFFC] border-[#0052CC] scale-105 shadow-md" 
                              : "bg-white border-[#DFE1E6] hover:border-[#0052CC]"
                          )}
                        >
                          <p className="font-bold capitalize">{r}</p>
                          <p className="text-[10px] text-[#6B778C]">
                            {r === 'conservative' ? 'Low risk, stable returns' : 
                             r === 'moderate' ? 'Balanced growth' : 'High growth potential'}
                          </p>
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={generateAdvice}
                      disabled={generatingAdvice}
                      className="w-full bg-[#0052CC] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#0747A6] disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                    >
                      {generatingAdvice ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          AI is building your plan...
                        </>
                      ) : (
                        <>Get Personalized Investment Plan <TrendingUp className="w-5 h-5" /></>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 'advice' && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div id="advice-content" className="bg-white rounded-3xl border border-[#DFE1E6] overflow-hidden">
                    <div className="p-8 bg-[#0052CC] text-white flex justify-between items-center">
                      <div>
                        <h2 className="text-2xl font-bold">Your Financial Roadmap</h2>
                        <p className="opacity-80">AI-powered recommendations based on your {riskProfile} profile.</p>
                      </div>
                      <TrendingUp className="w-10 h-10 opacity-50" />
                    </div>
                    <div className="p-8 prose prose-slate max-w-none">
                      <div className="bg-[#F4F5F7] p-6 rounded-2xl mb-8 border-l-4 border-[#0052CC]">
                        <p className="text-sm italic text-[#6B778C]">
                          "Based on your total income of ₹{totalIncome.toLocaleString()} and {riskProfile} risk profile, 
                          here's how you can optimize your taxes and build wealth."
                        </p>
                      </div>
                      <div className="markdown-body">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{advice}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="p-8 bg-[#F4F5F7] border-t border-[#DFE1E6] flex justify-between no-print" data-html2canvas-ignore>
                      <button 
                        onClick={() => transition('GO_BACK')}
                        className="text-[#6B778C] font-bold hover:text-[#172B4D]"
                      >
                        Back to Analysis
                      </button>
                      <button 
                        onClick={handleDownloadPDF}
                        disabled={isDownloadingPdf}
                        className="bg-white border border-[#DFE1E6] text-[#172B4D] px-6 py-2 rounded-lg font-bold hover:bg-white shadow-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {isDownloadingPdf ? (
                          <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#172B4D]"></div> Generating PDF...</>
                        ) : (
                          <><FileText className="w-4 h-4" /> Download PDF</>
                        )}
                      </button>
                    </div>
                  </div>

                  {deductions.hra === 0 && (
                    <div className="bg-[#E6EFFC] p-6 rounded-2xl flex items-start gap-4 border border-[#B3D4FF]">
                      <Info className="text-[#0052CC] w-6 h-6 shrink-0 mt-1" />
                      <div>
                        <h4 className="font-bold text-[#0052CC]">Professional Tip</h4>
                        <p className="text-sm text-[#0052CC] leading-relaxed">
                          You haven't claimed any HRA. If you live in a rented house, ensuring your HRA is calculated correctly could save you massive amounts of tax!
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-[#E3FCEF] p-6 rounded-2xl flex items-start gap-4 border border-[#36B37E]">
                    <ShieldCheck className="text-[#36B37E] w-6 h-6 shrink-0 mt-1" />
                    <div>
                      <h4 className="font-bold text-[#006644]">Expert Tip</h4>
                      <p className="text-sm text-[#006644] leading-relaxed">
                        Remember to invest before March 31st to claim deductions for this financial year. 
                        ELSS funds have the shortest lock-in period (3 years) among 80C options.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#DFE1E6] p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="bg-[#E6EFFC] p-2 rounded-lg">
                        <Info className="text-[#0052CC] w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold text-[#091E42]">General Tax Saving Tips</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="p-4 bg-[#F4F5F7] rounded-xl border border-[#DFE1E6]">
                          <h4 className="font-bold text-[#172B4D] mb-1 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#0052CC]"></div>
                            Section 80TTA
                          </h4>
                          <p className="text-sm text-[#6B778C]">
                            Claim deduction up to ₹10,000 on interest earned from your savings bank accounts. For senior citizens, this limit is ₹50,000 under 80TTB.
                          </p>
                        </div>
                        <div className="p-4 bg-[#F4F5F7] rounded-xl border border-[#DFE1E6]">
                          <h4 className="font-bold text-[#172B4D] mb-1 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#0052CC]"></div>
                            Section 80GG
                          </h4>
                          <p className="text-sm text-[#6B778C]">
                            If you live in a rented house but don't receive HRA from your employer, you can still claim rent deduction under this section.
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="p-4 bg-[#F4F5F7] rounded-xl border border-[#DFE1E6]">
                          <h4 className="font-bold text-[#172B4D] mb-1 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#0052CC]"></div>
                            Important Deadlines
                          </h4>
                          <ul className="text-sm text-[#6B778C] space-y-1">
                            <li>• <span className="font-bold">March 31:</span> Last date for tax-saving investments.</li>
                            <li>• <span className="font-bold">July 31:</span> Standard deadline for filing ITR.</li>
                            <li>• <span className="font-bold">Dec 31:</span> Deadline for belated/revised returns.</li>
                          </ul>
                        </div>
                        <div className="p-4 bg-[#F4F5F7] rounded-xl border border-[#DFE1E6]">
                          <h4 className="font-bold text-[#172B4D] mb-1 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#0052CC]"></div>
                            Preventive Health Checkups
                          </h4>
                          <p className="text-sm text-[#6B778C]">
                            Within the ₹25,000 limit of Section 80D, you can claim up to ₹5,000 for preventive health checkups for yourself and your family.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#DFE1E6] overflow-hidden p-8 no-print">
                    <h3 className="text-xl font-bold mb-2 text-[#091E42]">Fine-tune Your Investments</h3>
                    <p className="text-[#6B778C] mb-6">Update your actual investments to see how they impact your tax savings.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <div>
                        <label className="block text-sm font-bold text-[#6B778C] mb-2">80C Investments (ELSS, PPF, EPF)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-3 text-[#6B778C]">₹</span>
                          <input 
                            type="number" 
                            value={Number.isNaN(deductions.section80C) ? '' : deductions.section80C}
                            onChange={(e) => setDeductions({...deductions, section80C: e.target.value === '' ? 0 : Number(e.target.value)})}
                            className="w-full bg-[#F4F5F7] border-2 border-transparent focus:border-[#0052CC] rounded-xl py-3 pl-8 pr-4 outline-none transition-colors font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#6B778C] mb-2">80D Health Insurance</label>
                        <div className="relative">
                          <span className="absolute left-4 top-3 text-[#6B778C]">₹</span>
                          <input 
                            type="number" 
                            value={Number.isNaN(deductions.section80D) ? '' : deductions.section80D}
                            onChange={(e) => setDeductions({...deductions, section80D: e.target.value === '' ? 0 : Number(e.target.value)})}
                            className="w-full bg-[#F4F5F7] border-2 border-transparent focus:border-[#0052CC] rounded-xl py-3 pl-8 pr-4 outline-none transition-colors font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#6B778C] mb-2">NPS (Section 80CCD)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-3 text-[#6B778C]">₹</span>
                          <input 
                            type="number" 
                            value={Number.isNaN(deductions.nps) ? '' : deductions.nps}
                            onChange={(e) => setDeductions({...deductions, nps: e.target.value === '' ? 0 : Number(e.target.value)})}
                            className="w-full bg-[#F4F5F7] border-2 border-transparent focus:border-[#0052CC] rounded-xl py-3 pl-8 pr-4 outline-none transition-colors font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#6B778C] mb-2">Home Loan Interest (Sec 24)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-3 text-[#6B778C]">₹</span>
                          <input 
                            type="number" 
                            value={Number.isNaN(deductions.section24) ? '' : deductions.section24}
                            onChange={(e) => setDeductions({...deductions, section24: e.target.value === '' ? 0 : Number(e.target.value)})}
                            className="w-full bg-[#F4F5F7] border-2 border-transparent focus:border-[#0052CC] rounded-xl py-3 pl-8 pr-4 outline-none transition-colors font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#E6EFFC] p-6 rounded-2xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4 border border-[#B3D4FF]">
                      <div>
                        <p className="text-sm text-[#0052CC] font-bold uppercase tracking-wider mb-1">Potential Tax Savings</p>
                        <p className="text-3xl font-black text-[#091E42]">₹{savings.toLocaleString()}</p>
                      </div>
                      <div className="h-12 w-px bg-[#B3D4FF] hidden md:block"></div>
                      <div className="text-left md:text-right">
                        <p className="text-sm text-[#0052CC] font-bold uppercase tracking-wider mb-1">Recommended Regime</p>
                        <p className="text-xl font-bold text-[#091E42] capitalize">{betterRegime} Regime</p>
                      </div>
                    </div>

                    <button 
                      onClick={generateAdvice}
                      disabled={generatingAdvice}
                      className="w-full bg-[#0052CC] text-white py-4 rounded-xl font-bold hover:bg-[#0747A6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
                    >
                      {generatingAdvice ? (
                        <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> Recalculating Advice...</>
                      ) : (
                        <><Calculator className="w-5 h-5" /> Recalculate & Update Advice</>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-[#DFE1E6] text-center space-y-4 no-print">
        <p className="text-[#6B778C] text-sm">
          Built for the next billion Indian investors. Tax Wizard AI is your personal finance mentor.
        </p>
        <div className="flex justify-center gap-6 text-xs font-bold text-[#6B778C] uppercase tracking-widest">
          <a href="#" className="hover:text-[#0052CC]">Privacy</a>
          <a href="#" className="hover:text-[#0052CC]">Terms</a>
          <a href="#" className="hover:text-[#0052CC]">Disclaimer</a>
        </div>
      </footer>

      {/* Hidden PDF Export Container */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px' }}>
        <div id="pdf-export-container" className="bg-white p-8 text-[#172B4D] font-sans">
          {/* Header */}
          <div className="border-b-2 border-[#0052CC] pb-6 mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black text-[#0052CC] flex items-center gap-2">
                <Calculator className="w-8 h-8" /> TaxWizard AI
              </h1>
              <p className="text-[#6B778C] mt-2 font-bold">Personalized Tax & Investment Report</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-[#091E42]">Generated on: {new Date().toLocaleDateString()}</p>
              <p className="text-[#6B778C]">Risk Profile: <span className="capitalize font-bold">{riskProfile}</span></p>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[#091E42] mb-4 border-b pb-2">Financial Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#F4F5F7] p-6 rounded-lg border border-[#DFE1E6]">
                <p className="text-sm text-[#6B778C] font-bold uppercase tracking-wider mb-3">Income Breakdown</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Salary:</span> <span className="font-bold">₹{incomeSources.salary.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>House Property:</span> <span className="font-bold">₹{incomeSources.houseProperty.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Capital Gains:</span> <span className="font-bold">₹{incomeSources.capitalGains.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Business/Professional:</span> <span className="font-bold">₹{incomeSources.businessIncome.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Other Sources:</span> <span className="font-bold">₹{incomeSources.otherIncome.toLocaleString()}</span></div>
                  <div className="flex justify-between pt-2 border-t font-black text-lg"><span>Total Gross Income:</span> <span>₹{totalIncome.toLocaleString()}</span></div>
                </div>
              </div>
              <div className="bg-[#F4F5F7] p-6 rounded-lg border border-[#DFE1E6] flex flex-col justify-between">
                <div>
                  <p className="text-sm text-[#6B778C] font-bold uppercase tracking-wider mb-3">Deductions Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Section 80C:</span> <span className="font-bold">₹{oldRegime.appliedDeductions.section80C.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Section 80D:</span> <span className="font-bold">₹{oldRegime.appliedDeductions.section80D.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Section 24 (Home Loan):</span> <span className="font-bold">₹{oldRegime.appliedDeductions.section24.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Other Deductions:</span> <span className="font-bold">₹{(oldRegime.appliedDeductions.section80E + oldRegime.appliedDeductions.nps + oldRegime.appliedDeductions.hra + oldRegime.appliedDeductions.other).toLocaleString()}</span></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-[#DFE1E6] mt-4">
                  <div className="flex justify-between font-black text-lg"><span>Total Deductions:</span> <span>₹{oldRegime.appliedDeductions.total.toLocaleString()}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Tax Calculation Breakdown */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[#091E42] mb-4 border-b pb-2">Tax Calculation Breakdown</h2>
            <div className="grid grid-cols-2 gap-6">
              {/* Old Regime */}
              <div className="border border-[#DFE1E6] rounded-xl p-5 bg-white">
                <h3 className="font-bold text-lg mb-4 text-[#0052CC] flex items-center gap-2">
                  Old Tax Regime
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center"><span className="text-[#6B778C]">Taxable Income:</span> <span className="font-bold text-base">₹{oldRegime.taxableIncome.toLocaleString()}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[#6B778C]">Base Tax:</span> <span className="font-bold">₹{oldRegime.taxPayable.toLocaleString()}</span></div>
                  {oldRegime.rebate > 0 && (
                    <div className="flex justify-between items-center text-[#36B37E]"><span className="text-[#6B778C]">Rebate 87A:</span> <span className="font-bold">-₹{oldRegime.rebate.toLocaleString()}</span></div>
                  )}
                  <div className="flex justify-between items-center"><span className="text-[#6B778C]">Health & Edu Cess (4%):</span> <span className="font-bold">₹{oldRegime.cess.toLocaleString()}</span></div>
                  <div className="flex justify-between items-center pt-3 border-t border-[#DFE1E6] font-black text-lg">
                    <span className="text-[#091E42]">Total Tax:</span> 
                    <span className="text-[#091E42]">₹{oldRegime.totalTax.toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[#DFE1E6]">
                  <p className="font-bold text-sm mb-3 text-[#091E42]">Slab Breakdown:</p>
                  <div className="space-y-2">
                    {oldRegime.slabs.map((slab, idx) => (
                      <div key={idx} className="flex justify-between text-xs bg-[#F4F5F7] p-2 rounded">
                        <span className="text-[#6B778C] font-medium">{slab.rate}% on ₹{slab.amount.toLocaleString()}</span>
                        <span className="font-mono font-bold text-[#091E42]">₹{slab.tax.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* New Regime */}
              <div className="border border-[#DFE1E6] rounded-xl p-5 bg-white">
                <h3 className="font-bold text-lg mb-4 text-[#0052CC] flex items-center gap-2">
                  New Tax Regime
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center"><span className="text-[#6B778C]">Taxable Income:</span> <span className="font-bold text-base">₹{newRegime.taxableIncome.toLocaleString()}</span></div>
                  <div className="flex justify-between items-center"><span className="text-[#6B778C]">Base Tax:</span> <span className="font-bold">₹{newRegime.taxPayable.toLocaleString()}</span></div>
                  {newRegime.rebate > 0 && (
                    <div className="flex justify-between items-center text-[#36B37E]">
                      <span className="text-[#6B778C]">{newRegime.taxableIncome > 700000 ? 'Marginal Relief:' : 'Rebate 87A:'}</span> 
                      <span className="font-bold">-₹{newRegime.rebate.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center"><span className="text-[#6B778C]">Health & Edu Cess (4%):</span> <span className="font-bold">₹{newRegime.cess.toLocaleString()}</span></div>
                  <div className="flex justify-between items-center pt-3 border-t border-[#DFE1E6] font-black text-lg">
                    <span className="text-[#091E42]">Total Tax:</span> 
                    <span className="text-[#091E42]">₹{newRegime.totalTax.toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[#DFE1E6]">
                  <p className="font-bold text-sm mb-3 text-[#091E42]">Slab Breakdown:</p>
                  <div className="space-y-2">
                    {newRegime.slabs.map((slab, idx) => (
                      <div key={idx} className="flex justify-between text-xs bg-[#F4F5F7] p-2 rounded">
                        <span className="text-[#6B778C] font-medium">{slab.rate}% on ₹{slab.amount.toLocaleString()}</span>
                        <span className="font-mono font-bold text-[#091E42]">₹{slab.tax.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 bg-[#E3FCEF] p-5 rounded-xl border border-[#36B37E] flex items-center justify-center gap-3">
              <CheckCircle2 className="text-[#36B37E] w-6 h-6" />
              <p className="font-bold text-[#006644] text-lg">
                Recommendation: Opt for the <span className="capitalize">{betterRegime}</span> Regime and save ₹{savings.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="html2pdf__page-break"></div>

          {/* Investment Advice */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-[#091E42] mb-4 border-b pb-2">AI Investment Recommendations</h2>
            <div className="bg-[#F4F5F7] p-6 rounded-xl mb-6 border-l-4 border-[#0052CC]">
              <p className="text-sm italic text-[#6B778C] font-medium">
                "Based on your total income of ₹{totalIncome.toLocaleString()} and {riskProfile} risk profile, 
                here's how you can optimize your taxes and build wealth."
              </p>
            </div>
            <div className="prose prose-sm max-w-none prose-slate markdown-body">
              <ReactMarkdown>{advice}</ReactMarkdown>
            </div>
          </div>

          {/* General Tax Saving Tips */}
          <div className="mb-8 bg-white p-8 rounded-3xl border border-[#DFE1E6] shadow-sm">
            <h2 className="text-xl font-bold text-[#091E42] mb-6 flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-[#FFAB00]" /> General Tax Saving Tips
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#FFFAE6] p-5 rounded-xl border border-[#FFAB00]">
                <h3 className="font-bold text-[#825C00] mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Important Deadlines
                </h3>
                <ul className="text-sm text-[#825C00] space-y-2 list-disc pl-4">
                  <li><strong>July 31st:</strong> Deadline to file ITR for individuals.</li>
                  <li><strong>March 31st:</strong> Last date to complete tax-saving investments for the financial year.</li>
                  <li><strong>June 15th:</strong> First installment of Advance Tax (if applicable).</li>
                </ul>
              </div>
              <div className="bg-[#E3FCEF] p-5 rounded-xl border border-[#36B37E]">
                <h3 className="font-bold text-[#006644] mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Lesser-Known Deductions
                </h3>
                <ul className="text-sm text-[#006644] space-y-2 list-disc pl-4">
                  <li><strong>Section 80TTA:</strong> Deduction up to ₹10,000 on savings account interest.</li>
                  <li><strong>Section 80GG:</strong> Rent deduction for those who don't receive HRA.</li>
                  <li><strong>Section 80DD:</strong> Deduction for medical treatment of dependent with disability.</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <div className="text-center text-xs text-[#6B778C] border-t border-[#DFE1E6] pt-6 mt-12">
            <p className="mb-1">This report is AI-generated based on the provided inputs and should not be considered as professional financial advice.</p>
            <p className="font-bold">Generated by TaxWizard AI</p>
          </div>
        </div>
      </div>
      <Chatbot />
    </div>
  );
}
