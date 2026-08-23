import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app/App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { armBootSplashFallback } from "./lib/bootSplash";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>
);

/* شاشة البدء تُزال من الشاشة التي جهزت بياناتها (CustomerApp / AdminApp /
   صفحة الدفع) لا من هنا: تركيب React لا يعني أن الصفحة صارت جاهزة للعرض. */
armBootSplashFallback();
