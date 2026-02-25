import React, { useState } from "react";
import { ShoppingCart, ExternalLink, Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

export const BuyProxyView = () => {
  const { t } = useTranslation();
  const [linkCopied, setLinkCopied] = useState(false);
  const [promoCopied, setPromoCopied] = useState(false);
  const link = "https://proxy6.net/?r=833290";
  const promoCode = "resultproxy";

  const handleCopyAndGo = () => {
    const el = document.createElement("textarea");
    el.value = link;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);

    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);

    window.open(link, "_blank");
  };

  const handleCopyPromo = () => {
    const el = document.createElement("textarea");
    el.value = promoCode;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);

    setPromoCopied(true);
    setTimeout(() => setPromoCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-3xl font-bold text-white">{t("buy.title")}</h2>
        <p className="text-zinc-400 mt-2">{t("buy.desc")}</p>
      </div>

      <div className="bg-zinc-900 p-8 rounded-3xl border border-zinc-800 mt-6 text-center">
        <div className="bg-[#007E3A]/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShoppingCart className="w-8 h-8 text-[#007E3A]" />
        </div>
        <h3 className="text-white font-bold text-xl mb-4">
          {t("buy.discount")}
        </h3>
        <p className="text-zinc-400 text-md mb-8 leading-relaxed">
          {t("buy.discount_desc")}
        </p>

        <div className="space-y-4">
          <button
            onClick={handleCopyAndGo}
            className="w-full relative group border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none flex flex-col sm:flex-row items-center justify-between p-4 bg-zinc-950 border border-zinc-800 hover:border-[#00A819] rounded-2xl transition-all overflow-hidden gap-4 sm:gap-0"
          >
            <div className="absolute inset-0 bg-[#007E3A]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center space-x-4 relative z-10 w-full sm:w-auto overflow-hidden">
              <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 shrink-0">
                <ExternalLink className="w-5 h-5 text-zinc-400 group-hover:text-[#00A819] transition-colors" />
              </div>
              <span className="text-zinc-300 font-mono text-sm tracking-wide group-hover:text-white transition-colors truncate">
                {link}
              </span>
            </div>
            <div className="relative z-10 flex items-center justify-center w-full sm:w-auto space-x-2 bg-zinc-900 px-6 py-3 sm:px-4 sm:py-2 rounded-xl border border-zinc-800 group-hover:border-[#00A819]/50 transition-colors shrink-0">
              {linkCopied ? (
                <>
                  <Check className="w-4 h-4 text-[#00A819]" />
                  <span className="text-sm font-medium text-[#00A819]">
                    {t("buy.copied")}
                  </span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-zinc-400 group-hover:text-[#00A819]" />
                  <span className="text-sm font-medium text-zinc-400 group-hover:text-[#00A819]">
                    {t("buy.go")}
                  </span>
                </>
              )}
            </div>
          </button>

          <button
            onClick={handleCopyPromo}
            className="w-full relative group border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none flex flex-col sm:flex-row items-center justify-between p-4 bg-zinc-950 border border-zinc-800 hover:border-[#00A819] rounded-2xl transition-all overflow-hidden gap-4 sm:gap-0"
          >
            <div className="absolute inset-0 bg-[#007E3A]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center space-x-4 relative z-10 w-full sm:w-auto overflow-hidden">
              <div className="bg-zinc-900 p-3 rounded-xl border border-zinc-800 shrink-0">
                <Copy className="w-5 h-5 text-zinc-400 group-hover:text-[#00A819] transition-colors" />
              </div>
              <div className="flex flex-col items-start text-left min-w-0">
                <span className="text-xs text-zinc-500 font-medium mb-0.5">
                  {t("buy.promo_title")}
                </span>
                <span className="text-zinc-300 font-mono text-sm font-bold tracking-widest group-hover:text-white transition-colors truncate uppercase">
                  {promoCode}
                </span>
              </div>
            </div>
            <div className="relative z-10 flex items-center justify-center w-full sm:w-auto space-x-2 bg-zinc-900 px-6 py-3 sm:px-4 sm:py-2 rounded-xl border border-zinc-800 group-hover:border-[#00A819]/50 transition-colors shrink-0">
              {promoCopied ? (
                <>
                  <Check className="w-4 h-4 text-[#00A819]" />
                  <span className="text-sm font-medium text-[#00A819]">
                    {t("buy.copied")}
                  </span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-zinc-400 group-hover:text-[#00A819]" />
                  <span className="text-sm font-medium text-zinc-400 group-hover:text-[#00A819]">
                    {t("buy.copy")}
                  </span>
                </>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
