import React, { useState } from "react";
import { WalletProvider } from "./context/WalletContext";
import { ToastProvider } from "./context/ToastContext";
import Navbar from "./components/Navbar";
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
        <div className="min-h-screen">
          <Navbar view={view} setView={setView} />
          {page}
          <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-xs text-ink-faint">
            SkyVerdict — an Intelligent Contract on{" "}
            <a href="https://genlayer.com" target="_blank" rel="noreferrer" className="text-cyan hover:underline">
              GenLayer
            </a>
            . No trusted oracle, no claims desk — validators judge the flight data themselves.
          </footer>
        </div>
      </ToastProvider>
    </WalletProvider>
  );
}
