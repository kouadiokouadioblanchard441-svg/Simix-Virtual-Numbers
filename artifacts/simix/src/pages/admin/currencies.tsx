import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { adminApi } from "@/lib/admin-api";
import type { AdminCurrency } from "@/lib/admin-api";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, RefreshCw, TrendingUp, Globe, Check, X,
  ChevronDown, ChevronUp, Save, DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const XOF_CURRENCIES = new Set(["XOF", "XAF"]);

function RateBadge({ rate, label }: { rate: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono bg-zinc-800 border border-zinc-700 rounded-md px-2 py-0.5">
      <span className="text-zinc-400">{label}</span>
      <span className="text-white font-semibold">{rate}</span>
    </span>
  );
}

function CurrencyRow({ currency, onEdit, onDelete }: {
  currency: AdminCurrency;
  onEdit: (c: AdminCurrency) => void;
  onDelete: (id: number) => void;
}) {
  const isXof = XOF_CURRENCIES.has(currency.currencyCode);
  const spread = !isXof ? ((currency.clientRate - currency.realRate) / currency.realRate * 100).toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 px-5 py-4 border-b border-zinc-800/60 hover:bg-zinc-800/20 transition-colors group"
    >
      <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-bold text-violet-400">{currency.currencyCode}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm">{currency.countryCode}</span>
          <span className="text-zinc-500 text-xs">·</span>
          <span className="text-zinc-300 text-xs">{currency.currencyName}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {isXof ? (
            <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-0.5">
              XOF natif — pas de conversion
            </span>
          ) : (
            <>
              <RateBadge rate={currency.realRate} label="taux réel" />
              <RateBadge rate={currency.clientRate} label="taux client" />
              {spread && (
                <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-0.5 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  marge {spread}%
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={cn(
          "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
          currency.active
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : "text-zinc-500 bg-zinc-800 border-zinc-700"
        )}>
          {currency.active ? "Actif" : "Inactif"}
        </span>

        <button
          onClick={() => onEdit(currency)}
          className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-violet-600/20 hover:border-violet-500/40 transition-all"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(currency.id)}
          className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

const EMPTY_FORM = {
  countryCode: "", currencyCode: "", currencyName: "",
  realRate: "", clientRate: "", active: true,
};

function CurrencyForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof EMPTY_FORM, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const isXof = ["XOF", "XAF"].includes(form.currencyCode.toUpperCase());
  const valid = form.countryCode.length >= 2 && form.currencyCode.length >= 3 && form.currencyName.length >= 2
    && (isXof || (Number(form.realRate) > 0 && Number(form.clientRate) > 0));

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Code Pays</label>
          <input
            value={form.countryCode}
            onChange={e => set("countryCode", e.target.value.toUpperCase())}
            placeholder="CI"
            maxLength={4}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Code Devise</label>
          <input
            value={form.currencyCode}
            onChange={e => set("currencyCode", e.target.value.toUpperCase())}
            placeholder="XOF"
            maxLength={5}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Nom de la devise</label>
        <input
          value={form.currencyName}
          onChange={e => set("currencyName", e.target.value)}
          placeholder="Franc CFA UEMOA"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
        />
      </div>

      {!isXof && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Taux réel (1 local = ? XOF)</label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={form.realRate}
              onChange={e => set("realRate", e.target.value)}
              placeholder="4.2"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Taux client</label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={form.clientRate}
              onChange={e => set("clientRate", e.target.value)}
              placeholder="4.9"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
      )}

      {isXof && (
        <p className="text-xs text-zinc-500 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700">
          Devise XOF/XAF — taux 1:1 automatique, pas de conversion.
        </p>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <div
            onClick={() => set("active", !form.active)}
            className={cn(
              "w-10 h-5 rounded-full transition-colors",
              form.active ? "bg-violet-600" : "bg-zinc-700"
            )}
          >
            <div className={cn(
              "w-4 h-4 bg-white rounded-full mt-0.5 transition-transform",
              form.active ? "ml-5.5 translate-x-5" : "ml-0.5"
            )} />
          </div>
          <span className="text-sm text-zinc-300">Actif</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!valid || loading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition-all"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm font-semibold hover:text-white transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function AdminCurrencies() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCurrency | null>(null);

  const { data: currencies = [], isLoading } = useQuery({
    queryKey: ["admin-currencies"],
    queryFn: () => adminApi.getCurrencies(),
  });

  const createMut = useMutation({
    mutationFn: (d: Parameters<typeof adminApi.createCurrency>[0]) => adminApi.createCurrency(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-currencies"] }); setShowForm(false); toast({ title: "Devise créée" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Devise non créée", description: e.message }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof adminApi.updateCurrency>[1] }) => adminApi.updateCurrency(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-currencies"] }); setEditTarget(null); toast({ title: "Devise mise à jour" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Devise non mise à jour", description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => adminApi.deleteCurrency(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-currencies"] }); toast({ title: "Devise supprimée" }); },
    onError: (e: Error) => toast({ variant: "destructive", title: "Devise non supprimée", description: e.message }),
  });

  function handleSave(form: typeof EMPTY_FORM) {
    const isXof = ["XOF", "XAF"].includes(form.currencyCode.toUpperCase());
    const payload = {
      countryCode:  form.countryCode,
      currencyCode: form.currencyCode,
      currencyName: form.currencyName,
      realRate:   isXof ? 1 : Number(form.realRate),
      clientRate: isXof ? 1 : Number(form.clientRate),
      active:     form.active,
    };
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  }

  const xofCount    = currencies.filter(c => ["XOF","XAF"].includes(c.currencyCode)).length;
  const foreignCount= currencies.filter(c => !["XOF","XAF"].includes(c.currencyCode)).length;

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total", value: currencies.length, icon: Globe,      color: "text-violet-400" },
            { label: "Zone XOF/XAF", value: xofCount,     icon: Check,   color: "text-emerald-400" },
            { label: "Devises FX",   value: foreignCount,  icon: TrendingUp, color: "text-amber-400" },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
                <s.icon className={cn("w-4.5 h-4.5", s.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs text-zinc-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Header + Add button */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-violet-400" />
              <h2 className="font-semibold text-white text-sm">Configuration des devises</h2>
            </div>
            <button
              onClick={() => { setEditTarget(null); setShowForm(v => !v); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
            >
              {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showForm ? "Annuler" : "Ajouter"}
            </button>
          </div>

          <AnimatePresence>
            {(showForm && !editTarget) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="px-5 py-4 border-b border-zinc-800"
              >
                <CurrencyForm
                  initial={EMPTY_FORM}
                  onSave={handleSave}
                  onCancel={() => setShowForm(false)}
                  loading={createMut.isPending}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading ? (
            <div className="divide-y divide-zinc-800">
              {[0,1,2,3].map(i => <div key={i} className="h-20 animate-pulse bg-zinc-800/30" />)}
            </div>
          ) : currencies.length === 0 ? (
            <div className="py-16 text-center text-zinc-600">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune devise configurée</p>
            </div>
          ) : (
            <div>
              {currencies.map(c => (
                <div key={c.id}>
                  {editTarget?.id === c.id ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="px-5 py-4 border-b border-zinc-800"
                    >
                      <CurrencyForm
                        initial={{
                          countryCode:  c.countryCode,
                          currencyCode: c.currencyCode,
                          currencyName: c.currencyName,
                          realRate:     String(c.realRate),
                          clientRate:   String(c.clientRate),
                          active:       c.active,
                        }}
                        onSave={handleSave}
                        onCancel={() => setEditTarget(null)}
                        loading={updateMut.isPending}
                      />
                    </motion.div>
                  ) : (
                    <CurrencyRow
                      currency={c}
                      onEdit={c => { setShowForm(false); setEditTarget(c); }}
                      onDelete={id => deleteMut.mutate(id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
