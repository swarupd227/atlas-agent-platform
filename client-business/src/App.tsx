import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import DemoCenter from "@client-shared/pages/demo/demo-center";
import BlackRockDemo from "@client-shared/pages/demo/blackrock-demo";
import BlackRock2Demo from "@client-shared/pages/demo/blackrock2-demo";
import KinectiveDemo from "@client-shared/pages/demo/kinective-demo";
import MoodysDemo from "@client-shared/pages/demo/moodys-demo";
import HearstDemo from "@client-shared/pages/demo/hearst-demo";
import FitchDemo from "@client-shared/pages/demo/fitch-demo";
import FitchRWDemo from "@client-shared/pages/demo/fitch-rw-demo";
import BlackBookDemo from "@client-shared/pages/demo/blackbook-demo";
import LittlerDemo from "@client-shared/pages/demo/littler-demo";
import OtcQuoteDemo from "@client-shared/pages/demo/otc-quote-demo";
import OtcOrderDemo from "@client-shared/pages/demo/otc-order-demo";
import PkgSchedDemo from "@client-shared/pages/demo/pkg-sched-demo";
import SHHealthcareDemo from "@client-shared/pages/demo/sh-healthcare-demo";
import SHFinancialDemo from "@client-shared/pages/demo/sh-financial-demo";
import SHManufacturingDemo from "@client-shared/pages/demo/sh-manufacturing-demo";
import SHRetailDemo from "@client-shared/pages/demo/sh-retail-demo";
import SHEnergyDemo from "@client-shared/pages/demo/sh-energy-demo";
import SHInsuranceDemo from "@client-shared/pages/demo/sh-insurance-demo";

function Placeholder() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">ATLAS Business</h1>
        <p className="text-muted-foreground text-sm mb-6">
          The business-friendly workspace is being built. Check back soon.
        </p>
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Scaffold ready — Phase 1 in progress
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/demo" component={DemoCenter} />
      <Route path="/demo/blackrock" component={BlackRockDemo} />
      <Route path="/demo/blackrock2" component={BlackRock2Demo} />
      <Route path="/demo/kinective-coa" component={KinectiveDemo} />
      <Route path="/demo/kinective" component={KinectiveDemo} />
      <Route path="/demo/moodys" component={MoodysDemo} />
      <Route path="/demo/hearst" component={HearstDemo} />
      <Route path="/demo/fitch" component={FitchDemo} />
      <Route path="/demo/fitch-rw" component={FitchRWDemo} />
      <Route path="/demo/blackbook" component={BlackBookDemo} />
      <Route path="/demo/littler" component={LittlerDemo} />
      <Route path="/demo/otc-quote" component={OtcQuoteDemo} />
      <Route path="/demo/otc-order" component={OtcOrderDemo} />
      <Route path="/demo/pkg-sched" component={PkgSchedDemo} />
      <Route path="/demo/sh-healthcare" component={SHHealthcareDemo} />
      <Route path="/demo/sh-financial" component={SHFinancialDemo} />
      <Route path="/demo/sh-manufacturing" component={SHManufacturingDemo} />
      <Route path="/demo/sh-retail" component={SHRetailDemo} />
      <Route path="/demo/sh-energy" component={SHEnergyDemo} />
      <Route path="/demo/sh-insurance" component={SHInsuranceDemo} />
      <Route component={Placeholder} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppRoutes />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
