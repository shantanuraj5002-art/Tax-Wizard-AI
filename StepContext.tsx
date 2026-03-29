import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Step = 'welcome' | 'input' | 'comparison' | 'advice';
export type StepEvent = 'START' | 'SCAN_COMPLETE' | 'VIEW_ANALYSIS' | 'GET_ADVICE' | 'GO_BACK' | 'RESET';

interface StepContextType {
  step: Step;
  setStep: (step: Step) => void;
  transition: (event: StepEvent) => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

const StepContext = createContext<StepContextType | undefined>(undefined);

const TRANSITIONS: Record<Step, Partial<Record<StepEvent, Step>>> = {
  welcome: {
    START: 'input',
    SCAN_COMPLETE: 'input',
  },
  input: {
    VIEW_ANALYSIS: 'comparison',
    GO_BACK: 'welcome',
    RESET: 'welcome',
  },
  comparison: {
    GET_ADVICE: 'advice',
    GO_BACK: 'input',
    RESET: 'welcome',
  },
  advice: {
    GO_BACK: 'comparison',
    RESET: 'welcome',
  }
};

export const StepProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [step, setStep] = useState<Step>('welcome');

  const transition = (event: StepEvent) => {
    const nextStep = TRANSITIONS[step][event];
    if (nextStep) {
      setStep(nextStep);
    } else if (event === 'RESET') {
      setStep('welcome');
    } else if (event === 'GO_BACK') {
      // Fallback for GO_BACK if not explicitly defined
      const steps: Step[] = ['welcome', 'input', 'comparison', 'advice'];
      const currentIndex = steps.indexOf(step);
      if (currentIndex > 0) {
        setStep(steps[currentIndex - 1]);
      }
    }
  };

  const isFirstStep = step === 'welcome';
  const isLastStep = step === 'advice';

  return (
    <StepContext.Provider value={{ step, setStep, transition, isFirstStep, isLastStep }}>
      {children}
    </StepContext.Provider>
  );
};

export const useStep = () => {
  const context = useContext(StepContext);
  if (context === undefined) {
    throw new Error('useStep must be used within a StepProvider');
  }
  return context;
};
