import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type BlacklistEntry } from "@/lib/admin-api";
import { AdminGuard } from "@/components/admin-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Loader2, Trash2, Plus, Shield, Ban, Phone, Mail, User, Globe, AlertTriangle, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  ip:     { label: "Adresse IP",   icon: Globe,   color: "bg-red-500/20 text-red-400 border-red-500/20" },
  phone:  { label: "Téléphone",    icon: Phone,   color: "bg-orange-500/20 text-orange-400 border-orange-500/20" },
  email:  { label: "Email",        icon: Mail,    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/20" },
  userId: { label: "Utilisateur",  icon: User,    color: "bg-violet-500/20 text-violet-400 border-violet-500/20" },
};

function AddBanForm({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<"ip" | "phone" | "email" | "userId">("ip");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: () => adminApi.addBlacklist({ type, value, reason, permanent, expiresAt: permanent ? undefined : expiresAt }),
    onSuccess: () => {
      toast({ title: "Banni avec succès", description: `${value} ajouté à la liste noire.` });
      qc.invalidateQueries({ queryKey: ["admin-blacklist"] });
      onDone();
    },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Ban className="w-5 h-5 text-red-400" />
        <h3 className="text-white font-semibold">Ajouter un bannissement</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">Type de bannissement</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as typeof type)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
          >
            <option value="ip">Adresse IP</option>
            <option value="phone">Numéro de téléphone</option>
            <option value="email">Adresse email</option>
            <option value="userId">ID Utilisateur</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1.5 block">Valeur à bannir</label>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={type === "ip" ? "192.168.1.1" : type === "phone" ? "+2250701234567" : type === "email" ? "user@example.com" : "uuid..."}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-zinc-400 mb-1.5 block">Raison du bannissement</label>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Fraude, abus, activité suspecte..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={permanent} onChange={e => setPermanent(e.target.checked)} className="rounded" />
            <span className="text-sm text-zinc-300">Bannissement permanent</span>
          </label>
        </div>
        {!permanent && (
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Expiration</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => add.mutate()}
          disabled={!value.trim() || add.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors"
        >
          {add.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
          Bannir
        </button>
        <button onClick={onDone} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}

function BlacklistContent() {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["admin-blacklist"],
    queryFn: adminApi.getBlacklist,
    refetchInterval: 30000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.removeBlacklist(id),
    onSuccess: () => { toast({ title: "Bannissement levé" }); qc.invalidateQueries({ queryKey: ["admin-blacklist"] }); },
    onError: (e) => toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" }),
  });

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.value.toLowerCase().includes(search.toLowerCase()) || e.reason.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || e.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-400" />
            Liste Noire
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Gérez les adresses IP, téléphones et comptes bannis définitivement</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
        >
          {showAdd ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAdd ? "Annuler" : "Ajouter un ban"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const Icon = cfg.icon;
          const n = entries.filter(e => e.type === type).length;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(prev => prev === type ? "" : type)}
              className={`p-4 rounded-xl border transition-all text-left ${typeFilter === type ? cfg.color + " border-current" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}
            >
              <Icon className={`w-5 h-5 mb-2 ${typeFilter === type ? "" : "text-zinc-500"}`} />
              <div className={`text-2xl font-bold ${typeFilter === type ? "" : "text-white"}`}>{n}</div>
              <div className={`text-xs mt-0.5 ${typeFilter === type ? "" : "text-zinc-500"}`}>{cfg.label}s bannis</div>
            </button>
          );
        })}
      </div>

      {showAdd && <AddBanForm onDone={() => setShowAdd(false)} />}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une IP, téléphone, email..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-violet-500"
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm text-zinc-400">{filtered.length} entrée{filtered.length !== 1 ? "s" : ""} {typeFilter ? `· ${TYPE_CONFIG[typeFilter]?.label}` : ""}</span>
          {(search || typeFilter) && (
            <button onClick={() => { setSearch(""); setTypeFilter(""); }} className="text-xs text-violet-400 hover:text-violet-300">
              Effacer filtres
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-violet-500 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">{entries.length === 0 ? "Aucun bannissement actif" : "Aucun résultat"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Type</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Valeur</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Raison</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Banni par</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Durée</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Date</th>
                  <th className="py-3 px-4 text-xs text-zinc-500 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const cfg = TYPE_CONFIG[e.type] ?? TYPE_CONFIG.ip;
                  const Icon = cfg.icon;
                  const isExpired = e.expiresAt && new Date(e.expiresAt) < new Date();
                  return (
                    <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium border ${cfg.color}`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-white">{e.value}</td>
                      <td className="py-3 px-4 text-sm text-zinc-400 max-w-xs truncate">{e.reason}</td>
                      <td className="py-3 px-4 text-xs text-zinc-500 font-mono truncate max-w-[120px]">{e.bannedBy ?? "—"}</td>
                      <td className="py-3 px-4">
                        {e.permanent ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">Permanent</span>
                        ) : isExpired ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">Expiré</span>
                        ) : (
                          <span className="text-xs text-zinc-400">{e.expiresAt ? new Date(e.expiresAt).toLocaleDateString("fr-FR") : "—"}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-500">{new Date(e.createdAt).toLocaleDateString("fr-FR")}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => { if (confirm("Lever ce bannissement ?")) remove.mutate(e.id); }}
                          disabled={remove.isPending}
                          className="p-1.5 rounded hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors"
                          title="Lever le ban"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-300 text-sm font-medium">Comment fonctionne la liste noire ?</p>
          <p className="text-amber-400/70 text-xs mt-1">
            Les <strong>adresses IP</strong> bannies sont bloquées au niveau du serveur — aucune requête ne passe.
            Les <strong>téléphones</strong> et <strong>emails</strong> sont vérifiés à l'inscription et à la connexion.
            Les <strong>comptes utilisateur</strong> bannis sont automatiquement suspendus et ne peuvent plus se connecter.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminBlacklist() {
  return (
    <AdminGuard>
      <AdminLayout>
        <BlacklistContent />
      </AdminLayout>
    </AdminGuard>
  );
}
