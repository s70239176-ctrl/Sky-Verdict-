import React, { useState } from "react";
import { WalletProvider } from "./context/WalletContext";
import { ToastProvider } from "./context/ToastContext";
import Navbar from "./components/Navbar";
import MobileBottomNav from "./components/MobileBottomNav";
import Home from "./pages/Home";
import BuyCoverage from "./pages/BuyCoverage";
import MyPolicies from "./pages/MyPolicies";
import PolicyDetail from "./pages/PolicyDetail";
import Transparency from "./pages/Transparency";

export default function App() {
  const [view, setView] = useState("home");
  const [activePolicyId, setActivePolicyId] = useState(null);

  const openPolicy = (id) => {
    setActivePolicyId(id);
    setView("policy-detail");
  };

  let page;
  if (view === "home") page = <Home setView={setView} />;
  else if (view === "buy") page = <BuyCoverage setView={setView} openPolicy={openPolicy} />;
  else if (view === "policies") page = <MyPolicies setView={setView} openPolicy={openPolicy} />;
  else if (view === "policy-detail") page = <PolicyDetail policyId={activePolicyId} setView={setView} />;
  else if (view === "transparency") page = <Transparency openPolicy={openPolicy} />;
  else page = <Home setView={setView} />;

  return (
    <WalletProvider>
      <ToastProvider>
        <div className="min-h-screen pb-16 md:pb-0">
          <Navbar view={view} setView={setView} />
          {page}
          <footer className="border-t rule px-6 py-10 text-center font-mono text-xs text-ivory-soft/30 md:px-10 lg:px-16">
            SkyVerdict — verdicts powered by{" "}
            <a href="https://genlayer.com" target="_blank" rel="noreferrer" className="text-ivory-soft/50 hover:text-orange">
              GenLayer
            </a>
            . No trusted oracle, no claims desk — validators judge the flight data themselves.
          </footer>
          <MobileBottomNav view={view} setView={setView} />
        </div>
      </ToastProvider>
    </WalletProvider>
  );
}
