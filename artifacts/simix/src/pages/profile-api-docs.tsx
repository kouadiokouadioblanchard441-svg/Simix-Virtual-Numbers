import { useState, useRef, useCallback, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthGuard } from "@/components/auth-guard";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Code2, Copy, Check, ChevronDown, ChevronRight,
  Search, X, Zap, Globe, Phone, MessageSquare, Wallet,
  Webhook, AlertTriangle, Clock, BookOpen, Terminal,
  Shield, Key, Play, ExternalLink, Hash, FileCode,
  Package, Layers, Activity,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */
type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
type Lang = "curl" | "javascript" | "python" | "php" | "go";

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  title: string;
  description: string;
  auth: boolean;
  headers?: Param[];
  queryParams?: Param[];
  bodyParams?: Param[];
  response: string;
  codes: { code: number; label: string; desc: string }[];
  examples: Record<Lang, string>;
}

interface Section {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  description: string;
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const BASE_URL = "https://simix.site/api";
const API_VERSION = "v1";

const SECTIONS: Section[] = [
  { id: "quickstart", label: "Démarrage", icon: Zap, description: "Guide de démarrage rapide" },
  { id: "auth", label: "Auth", icon: Key, description: "Authentification & sessions" },
  { id: "countries", label: "Pays", icon: Globe, description: "Pays & opérateurs" },
  { id: "services", label: "Services", icon: Package, description: "Services disponibles" },
  { id: "numbers", label: "Numéros", icon: Phone, description: "Achat & gestion" },
  { id: "sms", label: "SMS", icon: MessageSquare, description: "Réception & historique" },
  { id: "wallet", label: "Wallet", icon: Wallet, description: "Solde & transactions" },
  { id: "webhooks", label: "Webhooks", icon: Webhook, description: "Événements temps réel" },
  { id: "errors", label: "Erreurs", icon: AlertTriangle, description: "Codes & solutions" },
  { id: "sdk", label: "SDK", icon: Terminal, description: "Exemples complets" },
];

/* ─── Method badge colors ────────────────────────────────────────────── */
const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  PATCH: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

/* ─── Endpoint definitions ───────────────────────────────────────────── */
const ENDPOINTS: Endpoint[] = [
  /* ── Auth ── */
  {
    id: "register",
    method: "POST",
    path: "/auth/register",
    title: "Créer un compte",
    description: "Crée un nouveau compte utilisateur sur la plateforme Simix.",
    auth: false,
    bodyParams: [
      { name: "fullName", type: "string", required: true, description: "Nom complet de l'utilisateur", example: "Jean Dupont" },
      { name: "phone", type: "string", required: true, description: "Numéro de téléphone avec indicatif (+225...)", example: "+2250701234567" },
      { name: "password", type: "string", required: true, description: "Mot de passe (min 8 caractères)", example: "motdepasse123" },
      { name: "countryCode", type: "string", required: true, description: "Code pays ISO 2 lettres", example: "ci" },
    ],
    response: `{
  "id": "uuid-utilisateur",
  "fullName": "Jean Dupont",
  "phone": "+2250701234567",
  "balance": 0,
  "verified": false,
  "createdAt": "2026-01-01T00:00:00.000Z"
}`,
    codes: [
      { code: 201, label: "Created", desc: "Compte créé avec succès" },
      { code: 400, label: "Bad Request", desc: "Données invalides ou manquantes" },
      { code: 409, label: "Conflict", desc: "Numéro de téléphone déjà utilisé" },
    ],
    examples: {
      curl: `curl -X POST ${BASE_URL}/auth/register \\
  -H "Content-Type: application/json" \\
  -c cookies.txt \\
  -d '{
    "fullName": "Jean Dupont",
    "phone": "+2250701234567",
    "password": "motdepasse123",
    "countryCode": "ci"
  }'`,
      javascript: `const res = await fetch('${BASE_URL}/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    fullName: 'Jean Dupont',
    phone: '+2250701234567',
    password: 'motdepasse123',
    countryCode: 'ci',
  }),
});
const data = await res.json();
console.log(data);`,
      python: `import requests, json

resp = requests.post(
    '${BASE_URL}/auth/register',
    json={
        'fullName': 'Jean Dupont',
        'phone': '+2250701234567',
        'password': 'motdepasse123',
        'countryCode': 'ci',
    },
)
print(resp.json())`,
      php: `<?php
$ch = curl_init('${BASE_URL}/auth/register');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode([
        'fullName'    => 'Jean Dupont',
        'phone'       => '+2250701234567',
        'password'    => 'motdepasse123',
        'countryCode' => 'ci',
    ]),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_COOKIEFILE     => 'cookies.txt',
    CURLOPT_COOKIEJAR      => 'cookies.txt',
]);
$result = json_decode(curl_exec($ch), true);`,
      go: `package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
)

func main() {
    body, _ := json.Marshal(map[string]string{
        "fullName":    "Jean Dupont",
        "phone":       "+2250701234567",
        "password":    "motdepasse123",
        "countryCode": "ci",
    })
    resp, _ := http.Post(
        "${BASE_URL}/auth/register",
        "application/json",
        bytes.NewBuffer(body),
    )
    defer resp.Body.Close()
    fmt.Println(resp.Status)
}`,
    },
  },
  {
    id: "login",
    method: "POST",
    path: "/auth/login",
    title: "Se connecter",
    description: "Authentifie un utilisateur et crée une session sécurisée via cookie httpOnly.",
    auth: false,
    bodyParams: [
      { name: "phone", type: "string", required: true, description: "Numéro de téléphone", example: "+2250701234567" },
      { name: "password", type: "string", required: true, description: "Mot de passe", example: "motdepasse123" },
    ],
    response: `{
  "id": "uuid-utilisateur",
  "fullName": "Jean Dupont",
  "phone": "+2250701234567",
  "balance": 12450,
  "verified": true,
  "status": "Actif"
}`,
    codes: [
      { code: 200, label: "OK", desc: "Connexion réussie — cookie simix_session défini" },
      { code: 401, label: "Unauthorized", desc: "Identifiants incorrects" },
      { code: 429, label: "Too Many Requests", desc: "Trop de tentatives de connexion" },
    ],
    examples: {
      curl: `curl -X POST ${BASE_URL}/auth/login \\
  -H "Content-Type: application/json" \\
  -c cookies.txt \\
  -d '{
    "phone": "+2250701234567",
    "password": "motdepasse123"
  }'`,
      javascript: `const res = await fetch('${BASE_URL}/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // important : envoie le cookie de session
  body: JSON.stringify({
    phone: '+2250701234567',
    password: 'motdepasse123',
  }),
});
const user = await res.json();`,
      python: `import requests

session = requests.Session()
resp = session.post(
    '${BASE_URL}/auth/login',
    json={'phone': '+2250701234567', 'password': 'motdepasse123'},
)
# Le cookie de session est automatiquement sauvegardé dans session
print(resp.json())`,
      php: `<?php
$ch = curl_init('${BASE_URL}/auth/login');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode([
        'phone'    => '+2250701234567',
        'password' => 'motdepasse123',
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_COOKIEFILE => 'cookies.txt',
    CURLOPT_COOKIEJAR  => 'cookies.txt',
]);
$result = json_decode(curl_exec($ch), true);`,
      go: `// Utiliser un http.Client avec gestion des cookies
jar, _ := cookiejar.New(nil)
client := &http.Client{Jar: jar}

body, _ := json.Marshal(map[string]string{
    "phone":    "+2250701234567",
    "password": "motdepasse123",
})
resp, _ := client.Post(
    "${BASE_URL}/auth/login",
    "application/json",
    bytes.NewBuffer(body),
)`,
    },
  },
  {
    id: "me",
    method: "GET",
    path: "/auth/me",
    title: "Profil utilisateur",
    description: "Récupère les informations du compte connecté.",
    auth: true,
    response: `{
  "id": "uuid-utilisateur",
  "fullName": "Jean Dupont",
  "username": "jeandupont",
  "phone": "+2250701234567",
  "email": "jean@example.com",
  "balance": 12450,
  "verified": true,
  "status": "Actif",
  "isAdmin": false,
  "countryCode": "ci",
  "referralCode": "JEAN123",
  "createdAt": "2026-01-01T00:00:00.000Z"
}`,
    codes: [
      { code: 200, label: "OK", desc: "Profil retourné" },
      { code: 401, label: "Unauthorized", desc: "Session expirée ou absente" },
    ],
    examples: {
      curl: `curl ${BASE_URL}/auth/me \\
  -b cookies.txt`,
      javascript: `const res = await fetch('${BASE_URL}/auth/me', {
  credentials: 'include',
});
const user = await res.json();
console.log('Solde :', user.balance, 'FCFA');`,
      python: `resp = session.get('${BASE_URL}/auth/me')
user = resp.json()
print(f"Solde : {user['balance']} FCFA")`,
      php: `$ch = curl_init('${BASE_URL}/auth/me');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_COOKIEFILE     => 'cookies.txt',
]);
$user = json_decode(curl_exec($ch), true);
echo "Solde : " . $user['balance'] . " FCFA";`,
      go: `resp, _ := client.Get("${BASE_URL}/auth/me")
defer resp.Body.Close()
var user map[string]interface{}
json.NewDecoder(resp.Body).Decode(&user)`,
    },
  },
  /* ── Countries ── */
  {
    id: "get-countries",
    method: "GET",
    path: "/countries",
    title: "Lister les pays",
    description: "Retourne la liste complète des pays disponibles avec prix, disponibilité et opérateurs.",
    auth: true,
    response: `[
  {
    "id": "uuid-pays",
    "name": "Côte d'Ivoire",
    "code": "ci",
    "dialCode": "+225",
    "flag": "🇨🇮",
    "available": 142,
    "price": 350,
    "popular": true,
    "numbersEnabled": true
  },
  {
    "id": "uuid-pays-2",
    "name": "Sénégal",
    "code": "sn",
    "dialCode": "+221",
    "flag": "🇸🇳",
    "available": 87,
    "price": 380,
    "popular": true,
    "numbersEnabled": true
  }
]`,
    codes: [
      { code: 200, label: "OK", desc: "Liste des pays retournée" },
      { code: 401, label: "Unauthorized", desc: "Authentification requise" },
    ],
    examples: {
      curl: `curl ${BASE_URL}/countries -b cookies.txt`,
      javascript: `const res = await fetch('${BASE_URL}/countries', {
  credentials: 'include',
});
const countries = await res.json();
// Filtrer les pays disponibles
const available = countries.filter(c => c.available > 0);`,
      python: `countries = session.get('${BASE_URL}/countries').json()
available = [c for c in countries if c['available'] > 0]`,
      php: `$countries = json_decode(
    file_get_contents('${BASE_URL}/countries'),
    true
);`,
      go: `resp, _ := client.Get("${BASE_URL}/countries")
var countries []map[string]interface{}
json.NewDecoder(resp.Body).Decode(&countries)`,
    },
  },
  /* ── Services ── */
  {
    id: "get-services",
    method: "GET",
    path: "/services",
    title: "Lister les services",
    description: "Retourne tous les services de vérification disponibles (WhatsApp, Telegram, Google, etc.).",
    auth: true,
    response: `[
  {
    "id": "uuid-service",
    "name": "WhatsApp",
    "slug": "whatsapp",
    "scope": "messaging",
    "price": 300,
    "available": true,
    "color": "#25D366",
    "category": "messaging",
    "popular": true
  },
  {
    "id": "uuid-service-2",
    "name": "Telegram",
    "slug": "telegram",
    "scope": "messaging",
    "price": 250,
    "available": true,
    "color": "#2AABEE",
    "category": "messaging",
    "popular": true
  }
]`,
    codes: [
      { code: 200, label: "OK", desc: "Liste des services retournée" },
      { code: 401, label: "Unauthorized", desc: "Authentification requise" },
    ],
    examples: {
      curl: `curl ${BASE_URL}/services -b cookies.txt`,
      javascript: `const services = await fetch('${BASE_URL}/services', {
  credentials: 'include',
}).then(r => r.json());

const whatsapp = services.find(s => s.slug === 'whatsapp');
console.log('Prix WhatsApp :', whatsapp.price, 'FCFA');`,
      python: `services = session.get('${BASE_URL}/services').json()
whatsapp = next(s for s in services if s['slug'] == 'whatsapp')`,
      php: `$services = json_decode(
    file_get_contents('${BASE_URL}/services'),
    true
);`,
      go: `resp, _ := client.Get("${BASE_URL}/services")
var services []map[string]interface{}
json.NewDecoder(resp.Body).Decode(&services)`,
    },
  },
  /* ── Numbers ── */
  {
    id: "number-quote",
    method: "GET",
    path: "/numbers/quote",
    title: "Obtenir un devis",
    description: "Retourne le prix et la disponibilité en temps réel pour un service et un pays donnés.",
    auth: true,
    queryParams: [
      { name: "serviceId", type: "string (UUID)", required: true, description: "ID du service", example: "uuid-service" },
      { name: "countryId", type: "string (UUID)", required: true, description: "ID du pays", example: "uuid-pays" },
    ],
    response: `{
  "service": {
    "id": "uuid-service",
    "name": "WhatsApp",
    "slug": "whatsapp"
  },
  "country": {
    "id": "uuid-pays",
    "name": "Côte d'Ivoire",
    "code": "ci",
    "available": true
  },
  "available": 142,
  "price": 350,
  "fees": 0,
  "total": 350,
  "waitTime": "10 - 60 sec",
  "validityMinutes": 20
}`,
    codes: [
      { code: 200, label: "OK", desc: "Devis retourné" },
      { code: 404, label: "Not Found", desc: "Service ou pays introuvable" },
    ],
    examples: {
      curl: `curl "${BASE_URL}/numbers/quote?serviceId=UUID_SERVICE&countryId=UUID_PAYS" \\
  -b cookies.txt`,
      javascript: `const params = new URLSearchParams({
  serviceId: 'UUID_SERVICE',
  countryId: 'UUID_PAYS',
});
const quote = await fetch(\`${BASE_URL}/numbers/quote?\${params}\`, {
  credentials: 'include',
}).then(r => r.json());

console.log(\`Prix : \${quote.price} FCFA\`);
console.log(\`Disponible : \${quote.available} numéros\`);`,
      python: `quote = session.get(
    '${BASE_URL}/numbers/quote',
    params={'serviceId': 'UUID_SERVICE', 'countryId': 'UUID_PAYS'},
).json()`,
      php: `$quote = json_decode(file_get_contents(
    '${BASE_URL}/numbers/quote?serviceId=UUID_SERVICE&countryId=UUID_PAYS'
), true);`,
      go: `url := "${BASE_URL}/numbers/quote?serviceId=UUID&countryId=UUID"
resp, _ := client.Get(url)`,
    },
  },
  {
    id: "buy-number",
    method: "POST",
    path: "/numbers",
    title: "Acheter un numéro",
    description: "Achète et réserve un numéro virtuel. Le prix est déduit instantanément du solde wallet.",
    auth: true,
    bodyParams: [
      { name: "serviceId", type: "string (UUID)", required: true, description: "ID du service à utiliser", example: "uuid-service" },
      { name: "countryId", type: "string (UUID)", required: true, description: "ID du pays du numéro", example: "uuid-pays" },
      { name: "numberType", type: "string", required: false, description: '"activation" (défaut) ou "hosting"', example: "activation" },
    ],
    response: `{
  "id": "uuid-numero",
  "phoneNumber": "+12025551234",
  "service": "WhatsApp",
  "country": "Côte d'Ivoire",
  "status": "waiting",
  "price": 350,
  "expiresAt": "2026-01-01T00:20:00.000Z",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "messages": []
}`,
    codes: [
      { code: 200, label: "OK", desc: "Numéro acheté et en attente de SMS" },
      { code: 402, label: "Payment Required", desc: "Solde insuffisant" },
      { code: 503, label: "Service Unavailable", desc: "Aucun numéro disponible chez le fournisseur" },
      { code: 429, label: "Too Many Requests", desc: "Limite d'achats atteinte" },
    ],
    examples: {
      curl: `curl -X POST ${BASE_URL}/numbers \\
  -H "Content-Type: application/json" \\
  -b cookies.txt \\
  -d '{
    "serviceId": "UUID_SERVICE",
    "countryId": "UUID_PAYS"
  }'`,
      javascript: `const number = await fetch('${BASE_URL}/numbers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    serviceId: 'UUID_SERVICE',
    countryId: 'UUID_PAYS',
  }),
}).then(r => r.json());

console.log('Numéro :', number.phoneNumber);
// Attendre le SMS...
const interval = setInterval(async () => {
  const res = await pollNumber(number.id);
  if (res.messages.length > 0) {
    clearInterval(interval);
    console.log('SMS reçu :', res.messages[0].code);
  }
}, 5000);`,
      python: `import time

number = session.post(
    '${BASE_URL}/numbers',
    json={'serviceId': 'UUID_SERVICE', 'countryId': 'UUID_PAYS'},
).json()

print(f"Numéro : {number['phoneNumber']}")

# Attendre le SMS
while True:
    time.sleep(5)
    res = session.post(
        f"${BASE_URL}/numbers/{number['id']}/poll"
    ).json()
    if res['messages']:
        print(f"Code : {res['messages'][0]['code']}")
        break`,
      php: `$ch = curl_init('${BASE_URL}/numbers');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode([
        'serviceId' => 'UUID_SERVICE',
        'countryId' => 'UUID_PAYS',
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_COOKIEFILE => 'cookies.txt',
]);
$number = json_decode(curl_exec($ch), true);`,
      go: `body, _ := json.Marshal(map[string]string{
    "serviceId": "UUID_SERVICE",
    "countryId": "UUID_PAYS",
})
resp, _ := client.Post(
    "${BASE_URL}/numbers",
    "application/json",
    bytes.NewBuffer(body),
)`,
    },
  },
  {
    id: "poll-number",
    method: "POST",
    path: "/numbers/:id/poll",
    title: "Vérifier les SMS",
    description: "Force une vérification en temps réel auprès du fournisseur pour récupérer les SMS entrants.",
    auth: true,
    response: `{
  "id": "uuid-numero",
  "phoneNumber": "+12025551234",
  "status": "received",
  "messages": [
    {
      "id": "uuid-sms",
      "sender": "Whatsapp",
      "body": "Your WhatsApp code is 847291",
      "code": "847291",
      "receivedAt": "2026-01-01T00:05:32.000Z"
    }
  ]
}`,
    codes: [
      { code: 200, label: "OK", desc: "Statut et SMS retournés" },
      { code: 404, label: "Not Found", desc: "Numéro introuvable ou n'appartient pas à l'utilisateur" },
      { code: 429, label: "Too Many Requests", desc: "Max 12 polls/minute par utilisateur" },
    ],
    examples: {
      curl: `curl -X POST ${BASE_URL}/numbers/UUID_NUMERO/poll \\
  -b cookies.txt`,
      javascript: `async function pollNumber(numberId) {
  const res = await fetch(\`${BASE_URL}/numbers/\${numberId}/poll\`, {
    method: 'POST',
    credentials: 'include',
  });
  return res.json();
}

// Polling toutes les 5 secondes, max 4 minutes
async function waitForSMS(numberId) {
  for (let i = 0; i < 48; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const data = await pollNumber(numberId);
    if (data.messages?.length > 0) return data.messages[0].code;
  }
  throw new Error('Timeout — aucun SMS reçu');
}`,
      python: `def wait_for_sms(number_id, timeout=240, interval=5):
    for _ in range(timeout // interval):
        time.sleep(interval)
        res = session.post(
            f'${BASE_URL}/numbers/{number_id}/poll'
        ).json()
        if res.get('messages'):
            return res['messages'][0]['code']
    raise TimeoutError("Aucun SMS reçu")`,
      php: `function pollNumber($numberId) {
    $ch = curl_init("${BASE_URL}/numbers/$numberId/poll");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_COOKIEFILE     => 'cookies.txt',
    ]);
    return json_decode(curl_exec($ch), true);
}`,
      go: `resp, _ := client.Post(
    "${BASE_URL}/numbers/UUID/poll",
    "application/json",
    nil,
)`,
    },
  },
  {
    id: "cancel-number",
    method: "POST",
    path: "/numbers/:id/cancel",
    title: "Annuler un numéro",
    description: "Annule un numéro en attente et rembourse automatiquement le solde.",
    auth: true,
    response: `{
  "success": true,
  "refunded": 350,
  "message": "Numéro annulé. 350 FCFA remboursés sur votre portefeuille."
}`,
    codes: [
      { code: 200, label: "OK", desc: "Numéro annulé et remboursé" },
      { code: 400, label: "Bad Request", desc: "Le numéro a déjà reçu un SMS (non annulable)" },
      { code: 404, label: "Not Found", desc: "Numéro introuvable" },
    ],
    examples: {
      curl: `curl -X POST ${BASE_URL}/numbers/UUID_NUMERO/cancel \\
  -b cookies.txt`,
      javascript: `const result = await fetch(\`${BASE_URL}/numbers/\${numberId}/cancel\`, {
  method: 'POST',
  credentials: 'include',
}).then(r => r.json());

if (result.success) {
  console.log(\`Remboursé : \${result.refunded} FCFA\`);
}`,
      python: `result = session.post(
    f'${BASE_URL}/numbers/{number_id}/cancel'
).json()`,
      php: `$ch = curl_init("${BASE_URL}/numbers/$numberId/cancel");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_COOKIEFILE     => 'cookies.txt',
]);
$result = json_decode(curl_exec($ch), true);`,
      go: `resp, _ := client.Post(
    "${BASE_URL}/numbers/UUID/cancel",
    "", nil,
)`,
    },
  },
  /* ── Wallet ── */
  {
    id: "get-balance",
    method: "GET",
    path: "/auth/me",
    title: "Consulter le solde",
    description: "Le solde est inclus dans le profil utilisateur (champ `balance` en FCFA).",
    auth: true,
    response: `{
  "balance": 12450,
  "currency": "FCFA"
}`,
    codes: [
      { code: 200, label: "OK", desc: "Solde retourné dans le profil" },
      { code: 401, label: "Unauthorized", desc: "Authentification requise" },
    ],
    examples: {
      curl: `# Le solde est dans /auth/me
curl ${BASE_URL}/auth/me -b cookies.txt | jq .balance`,
      javascript: `const { balance } = await fetch('${BASE_URL}/auth/me', {
  credentials: 'include',
}).then(r => r.json());
console.log(\`Solde : \${balance} FCFA\`);`,
      python: `user = session.get('${BASE_URL}/auth/me').json()
print(f"Solde : {user['balance']} FCFA")`,
      php: `$user = json_decode(
    file_get_contents('${BASE_URL}/auth/me'), true
);
echo $user['balance'] . ' FCFA';`,
      go: `resp, _ := client.Get("${BASE_URL}/auth/me")
var user map[string]interface{}
json.NewDecoder(resp.Body).Decode(&user)
fmt.Printf("Solde : %v FCFA\n", user["balance"])`,
    },
  },
  {
    id: "get-transactions",
    method: "GET",
    path: "/wallet/transactions",
    title: "Historique des transactions",
    description: "Retourne l'historique complet des transactions du compte connecté.",
    auth: true,
    response: `[
  {
    "id": "uuid-tx",
    "type": "purchase",
    "amount": 350,
    "status": "completed",
    "method": "wallet",
    "description": "WhatsApp – Côte d'Ivoire (5sim)",
    "createdAt": "2026-01-01T00:05:00.000Z"
  },
  {
    "id": "uuid-tx-2",
    "type": "recharge",
    "amount": 5000,
    "status": "completed",
    "method": "mobile_money",
    "description": "Recharge Orange Money",
    "createdAt": "2025-12-31T22:00:00.000Z"
  }
]`,
    codes: [
      { code: 200, label: "OK", desc: "Historique retourné" },
      { code: 401, label: "Unauthorized", desc: "Authentification requise" },
    ],
    examples: {
      curl: `curl ${BASE_URL}/wallet/transactions -b cookies.txt`,
      javascript: `const transactions = await fetch('${BASE_URL}/wallet/transactions', {
  credentials: 'include',
}).then(r => r.json());

// Filtrer les achats
const purchases = transactions.filter(t => t.type === 'purchase');`,
      python: `transactions = session.get(
    '${BASE_URL}/wallet/transactions'
).json()`,
      php: `$transactions = json_decode(
    file_get_contents('${BASE_URL}/wallet/transactions'),
    true
);`,
      go: `resp, _ := client.Get("${BASE_URL}/wallet/transactions")
var txs []map[string]interface{}
json.NewDecoder(resp.Body).Decode(&txs)`,
    },
  },
];

/* ─── Helpers ──────────────────────────────────────────────────────── */

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black tracking-wide border font-mono ${METHOD_COLORS[method]}`}>
      {method}
    </span>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);
  return { copied, copy };
}

function CodeBlock({ code, id, lang }: { code: string; id: string; lang?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="relative mt-2">
      <div className="bg-[#0d0d1a] border border-violet-900/40 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-violet-900/30 bg-violet-950/30">
          <span className="text-[10px] text-violet-400/70 font-mono font-medium">{lang ?? "json"}</span>
          <button
            onClick={() => copy(code, id)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-violet-300 transition-colors"
          >
            {copied === id ? (
              <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copié</span></>
            ) : (
              <><Copy className="w-3 h-3" /><span>Copier</span></>
            )}
          </button>
        </div>
        <pre className="p-3 text-[11px] font-mono text-violet-100/80 overflow-x-auto leading-relaxed whitespace-pre">
          {code}
        </pre>
      </div>
    </div>
  );
}

function ParamRow({ param }: { param: Param }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-card-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-violet-300 font-bold">{param.name}</span>
          <span className="text-[9px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-mono">{param.type}</span>
          {param.required && (
            <span className="text-[9px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">requis</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{param.description}</p>
      </div>
    </div>
  );
}

function LangTabs({ langs, active, onChange }: { langs: Lang[]; active: Lang; onChange: (l: Lang) => void }) {
  const labels: Record<Lang, string> = {
    curl: "cURL",
    javascript: "JavaScript",
    python: "Python",
    php: "PHP",
    go: "Go",
  };
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 hide-scrollbar">
      {langs.map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
            active === l
              ? "bg-violet-600 text-white"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {labels[l]}
        </button>
      ))}
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("curl");
  const { copied, copy } = useCopy();
  const langs = Object.keys(ep.examples) as Lang[];

  return (
    <div className="bg-card border border-card-border rounded-2xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors text-left"
      >
        <MethodBadge method={ep.method} />
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] text-muted-foreground truncate">{ep.path}</div>
          <div className="text-[12px] font-bold text-foreground truncate mt-0.5">{ep.title}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {ep.auth && <Shield className="w-3.5 h-3.5 text-violet-400" />}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-card-border/50 pt-3 space-y-4">
              <p className="text-[12px] text-muted-foreground leading-relaxed">{ep.description}</p>

              {ep.auth && (
                <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/8 border border-violet-500/20 rounded-xl">
                  <Shield className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                  <p className="text-[11px] text-violet-300">Requiert une session authentifiée (cookie <span className="font-mono">simix_session</span>)</p>
                </div>
              )}

              {/* Query params */}
              {ep.queryParams && ep.queryParams.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Paramètres URL</p>
                  <div className="bg-secondary/30 rounded-xl px-3">
                    {ep.queryParams.map(p => <ParamRow key={p.name} param={p} />)}
                  </div>
                </div>
              )}

              {/* Body params */}
              {ep.bodyParams && ep.bodyParams.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Corps de la requête</p>
                  <div className="bg-secondary/30 rounded-xl px-3">
                    {ep.bodyParams.map(p => <ParamRow key={p.name} param={p} />)}
                  </div>
                </div>
              )}

              {/* Codes */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Codes HTTP</p>
                <div className="space-y-1.5">
                  {ep.codes.map(c => (
                    <div key={c.code} className="flex items-center gap-3">
                      <span className={`font-mono text-[11px] font-black w-8 ${c.code >= 200 && c.code < 300 ? "text-emerald-400" : c.code >= 400 ? "text-red-400" : "text-amber-400"}`}>
                        {c.code}
                      </span>
                      <span className="text-[11px] text-foreground font-medium">{c.label}</span>
                      <span className="text-[11px] text-muted-foreground flex-1">— {c.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Response */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Réponse JSON</p>
                <CodeBlock code={ep.response} id={`resp-${ep.id}`} lang="json" />
              </div>

              {/* Code examples */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Exemples de code</p>
                <LangTabs langs={langs} active={lang} onChange={setLang} />
                <CodeBlock code={ep.examples[lang]} id={`ex-${ep.id}-${lang}`} lang={lang} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Section renderers ──────────────────────────────────────────────── */
function SectionQuickstart() {
  const { copied, copy } = useCopy();
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-900/60 via-card to-card border border-violet-500/30 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Simix API</h2>
            <p className="text-[11px] text-violet-300">Version {API_VERSION} · REST · JSON</p>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Intégrez l'achat de numéros virtuels et la réception de SMS directement dans vos applications.
          L'API Simix est <strong className="text-foreground">RESTful</strong>, retourne du JSON, et utilise les sessions HTTP standard.
        </p>
      </div>

      {/* Base URL */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">URL de base</p>
        <div className="flex items-center gap-2 bg-[#0d0d1a] border border-violet-900/40 rounded-xl p-3">
          <span className="font-mono text-[12px] text-violet-300 flex-1">{BASE_URL}</span>
          <button onClick={() => copy(BASE_URL, "base-url")} className="flex-shrink-0">
            {copied === "base-url" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {/* Auth info */}
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Key className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-foreground">Authentification</h3>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
          L'API Simix utilise les <strong className="text-foreground">sessions HTTP</strong> avec cookie <code className="font-mono bg-secondary px-1 rounded text-[11px]">simix_session</code> (httpOnly, Secure, SameSite=Lax).
        </p>
        <div className="space-y-2">
          {[
            { step: "1", label: "Créer un compte", path: "POST /auth/register" },
            { step: "2", label: "Se connecter", path: "POST /auth/login" },
            { step: "3", label: "Envoyer credentials: 'include'", path: "sur toutes les requêtes" },
          ].map(s => (
            <div key={s.step} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-400 text-[10px] font-black flex items-center justify-center flex-shrink-0">{s.step}</span>
              <div>
                <p className="text-[12px] font-semibold text-foreground">{s.label}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{s.path}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* First request */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Première requête</p>
        <CodeBlock
          id="first-req"
          lang="bash"
          code={`# 1. Se connecter
curl -X POST ${BASE_URL}/auth/login \\
  -H "Content-Type: application/json" \\
  -c cookies.txt \\
  -d '{"phone":"+2250701234567","password":"motdepasse"}'

# 2. Lister les services disponibles
curl ${BASE_URL}/services -b cookies.txt

# 3. Acheter un numéro WhatsApp
curl -X POST ${BASE_URL}/numbers \\
  -H "Content-Type: application/json" \\
  -b cookies.txt \\
  -d '{"serviceId":"UUID_WA","countryId":"UUID_CI"}'`}
        />
      </div>

      {/* Format réponse */}
      <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Format de réponse</h3>
        <div className="space-y-2">
          {[
            { icon: "✅", label: "Succès", desc: 'Objet JSON ou tableau avec les données' },
            { icon: "❌", label: "Erreur", desc: '{ "error": "message explicite en français" }' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <span className="text-base">{f.icon}</span>
              <div>
                <p className="text-[12px] font-bold text-foreground">{f.label}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionAuth() {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-foreground">Système de session</h3>
        </div>
        <div className="space-y-3 text-[12px] text-muted-foreground leading-relaxed">
          <p>L'API utilise des <strong className="text-foreground">sessions côté serveur</strong> stockées en base de données, identifiées par un cookie <code className="font-mono bg-secondary px-1 rounded text-[11px]">simix_session</code>.</p>
          <div className="bg-secondary/50 rounded-xl p-3 space-y-2">
            {[
              { k: "Nom", v: "simix_session" },
              { k: "httpOnly", v: "true — inaccessible en JavaScript" },
              { k: "Secure", v: "true en production (HTTPS uniquement)" },
              { k: "SameSite", v: "Lax — protection CSRF" },
              { k: "Durée", v: "7 jours" },
            ].map(r => (
              <div key={r.k} className="flex gap-3">
                <span className="font-mono text-[11px] text-violet-300 w-20 flex-shrink-0">{r.k}</span>
                <span className="text-[11px]">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {ENDPOINTS.filter(e => ["register", "login", "me"].includes(e.id)).map(ep => (
        <EndpointCard key={ep.id} ep={ep} />
      ))}

      {/* Bonnes pratiques */}
      <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-amber-300">Bonnes pratiques</h3>
        </div>
        <ul className="space-y-2 text-[12px] text-muted-foreground">
          {[
            "Toujours utiliser credentials: 'include' (fetch) ou withCredentials: true (axios)",
            "Ne jamais exposer le cookie côté client — il est httpOnly",
            "Appeler POST /auth/logout pour invalider la session côté serveur",
            "En cas d'erreur 401, rediriger vers /login",
            "Vérifier la validité de la session avec GET /auth/me",
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-violet-400 flex-shrink-0 mt-0.5">→</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SectionNumbers() {
  return (
    <div className="space-y-3">
      {/* Overview */}
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">Flux d'achat</h3>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground overflow-x-auto hide-scrollbar">
          {["Quote", "→", "Achat", "→", "Poll SMS", "→", "Utiliser code", "→", "Terminé"].map((s, i) => (
            <span key={i} className={s === "→" ? "text-muted-foreground/40" : "bg-violet-600/15 text-violet-300 px-2 py-1 rounded-lg font-medium flex-shrink-0"}>
              {s}
            </span>
          ))}
        </div>
      </div>
      {ENDPOINTS.filter(e => ["number-quote", "buy-number", "poll-number", "cancel-number"].includes(e.id)).map(ep => (
        <EndpointCard key={ep.id} ep={ep} />
      ))}
      {/* Status */}
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Statuts d'un numéro</p>
        <div className="space-y-2">
          {[
            { s: "waiting", color: "bg-amber-500/15 text-amber-400", desc: "En attente du SMS" },
            { s: "received", color: "bg-emerald-500/15 text-emerald-400", desc: "SMS reçu avec succès" },
            { s: "cancelled", color: "bg-red-500/15 text-red-400", desc: "Annulé (remboursé)" },
            { s: "expired", color: "bg-secondary text-muted-foreground", desc: "Expiré sans SMS" },
          ].map(s => (
            <div key={s.s} className="flex items-center gap-3">
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-bold ${s.color}`}>{s.s}</span>
              <span className="text-[12px] text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionErrors() {
  const errors = [
    { code: 400, label: "Bad Request", color: "text-red-400", desc: "Corps/paramètres invalides ou manquants" },
    { code: 401, label: "Unauthorized", color: "text-red-400", desc: "Session expirée ou absente — reconnecter l'utilisateur" },
    { code: 402, label: "Payment Required", color: "text-amber-400", desc: "Solde insuffisant pour l'opération" },
    { code: 403, label: "Forbidden", color: "text-red-400", desc: "Compte suspendu ou action non autorisée" },
    { code: 404, label: "Not Found", color: "text-amber-400", desc: "Ressource introuvable ou n'appartient pas à l'utilisateur" },
    { code: 409, label: "Conflict", color: "text-amber-400", desc: "Conflit de données (ex: téléphone déjà utilisé)" },
    { code: 429, label: "Too Many Requests", color: "text-amber-400", desc: "Rate limit atteint — attendre avant de réessayer" },
    { code: 500, label: "Server Error", color: "text-red-400", desc: "Erreur interne — réessayer dans quelques secondes" },
    { code: 503, label: "Unavailable", color: "text-amber-400", desc: "Fournisseur de numéros indisponible ou maintenance" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border/50">
          <p className="text-sm font-bold text-foreground">Codes HTTP</p>
        </div>
        <div className="divide-y divide-card-border/40">
          {errors.map(e => (
            <div key={e.code} className="px-4 py-3">
              <div className="flex items-center gap-3 mb-0.5">
                <span className={`font-mono text-sm font-black w-8 ${e.color}`}>{e.code}</span>
                <span className="text-[12px] font-bold text-foreground">{e.label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground ml-11">{e.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Format erreur */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Format d'erreur</p>
        <CodeBlock
          id="error-format"
          lang="json"
          code={`{
  "error": "Solde insuffisant. Rechargez votre portefeuille."
}`}
        />
      </div>

      {/* Gestion erreurs JS */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Gestion en JavaScript</p>
        <CodeBlock
          id="error-handling"
          lang="javascript"
          code={`async function apiCall(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    // Redirection auto en cas de session expirée
    if (res.status === 401) {
      window.location.href = '/login';
      return;
    }
    throw new Error(data.error ?? \`Erreur \${res.status}\`);
  }

  return data;
}`}
        />
      </div>
    </div>
  );
}

function SectionRateLimits() {
  const limits = [
    { route: "POST /auth/login", limit: "5 req/min", note: "Protection brute-force" },
    { route: "POST /auth/register", limit: "10 req/heure", note: "Anti-spam inscription" },
    { route: "POST /numbers", limit: "Configurable/min", note: "Défini par l'admin" },
    { route: "POST /numbers/:id/poll", limit: "12 req/min", note: "1 poll toutes les 5s" },
    { route: "Toutes routes (global)", limit: "200 req/min", note: "Par adresse IP" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border/50">
          <p className="text-sm font-bold text-foreground">Limites de requêtes</p>
        </div>
        <div className="divide-y divide-card-border/40">
          {limits.map(l => (
            <div key={l.route} className="px-4 py-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono text-[10px] text-violet-300 flex-1 mr-2">{l.route}</span>
                <span className="text-[11px] font-black text-amber-400 flex-shrink-0">{l.limit}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{l.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl p-4">
        <p className="text-sm font-bold text-foreground mb-3">Headers de réponse</p>
        <div className="space-y-2">
          {[
            { k: "X-RateLimit-Limit", v: "Nombre max de requêtes autorisées" },
            { k: "X-RateLimit-Remaining", v: "Requêtes restantes dans la fenêtre" },
            { k: "Retry-After", v: "Secondes à attendre (si 429)" },
          ].map(h => (
            <div key={h.k} className="flex gap-3">
              <span className="font-mono text-[10px] text-violet-300 flex-shrink-0">{h.k}</span>
              <span className="text-[11px] text-muted-foreground">{h.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Retry strategy */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Stratégie de retry</p>
        <CodeBlock
          id="retry"
          lang="javascript"
          code={`async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 429;
      const isServerError = err.status >= 500;

      if (!isRateLimit && !isServerError) throw err;

      // Backoff exponentiel : 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Max retries atteints');
}`}
        />
      </div>
    </div>
  );
}

function SectionWebhooks() {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Webhook className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-foreground">Webhooks de paiement</h3>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Simix reçoit les notifications de paiement de PawaPay et Clapay via webhooks sécurisés.
          Les webhooks sont vérifiés par signature cryptographique avant traitement.
        </p>
      </div>

      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-card-border/50">
          <p className="text-sm font-bold text-foreground">Endpoints Webhook</p>
        </div>
        {[
          { method: "POST" as HttpMethod, path: "/wallet/pawapay/webhook", label: "PawaPay Dépôt", badge: "Signature Content-Digest" },
          { method: "POST" as HttpMethod, path: "/wallet/pawapay/refund-webhook", label: "PawaPay Remboursement", badge: "Signature Content-Digest" },
          { method: "POST" as HttpMethod, path: "/wallet/clapay/webhook", label: "Clapay Dépôt", badge: "Signature HMAC-SHA256" },
        ].map(e => (
          <div key={e.path} className="px-4 py-3 border-b border-card-border/40 last:border-0">
            <div className="flex items-center gap-2 mb-1">
              <MethodBadge method={e.method} />
              <span className="font-mono text-[11px] text-violet-300">{e.path}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-foreground">{e.label}</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">{e.badge}</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Événements PawaPay</p>
        <CodeBlock
          id="webhook-event"
          lang="json"
          code={`{
  "depositId": "DEP-SIMIX-UUID",
  "status": "COMPLETED",
  "amount": "5000",
  "currency": "XOF",
  "correspondent": "MTN_MOMO_CIV",
  "country": "CIV",
  "payer": { "type": "MSISDN", "address": { "value": "2250701234567" } }
}`}
        />
      </div>

      <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-bold text-amber-300">Sécurité des webhooks</p>
        </div>
        <ul className="space-y-1.5 text-[12px] text-muted-foreground">
          <li className="flex gap-2"><span className="text-violet-400">→</span> Chaque webhook est vérifié par signature HMAC avant traitement</li>
          <li className="flex gap-2"><span className="text-violet-400">→</span> Les webhooks avec signature invalide sont silencieusement ignorés</li>
          <li className="flex gap-2"><span className="text-violet-400">→</span> Déduplication via <code className="font-mono bg-secondary px-1 rounded">externalDepositId</code></li>
          <li className="flex gap-2"><span className="text-violet-400">→</span> Les endpoints webhook contournent le rate limiting</li>
        </ul>
      </div>
    </div>
  );
}

function SectionSDK() {
  const [lang, setLang] = useState<Lang>("javascript");

  const fullExamples: Record<Lang, string> = {
    javascript: `// Simix API — Exemple complet JavaScript/Node.js
// Acheter un numéro WhatsApp en Côte d'Ivoire et attendre le SMS

const BASE = '${BASE_URL}';

class SimixClient {
  constructor() { this.session = null; }

  async login(phone, password) {
    const res = await fetch(\`\${BASE}/auth/login\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    this.session = await res.json();
    return this.session;
  }

  async get(path) {
    const res = await fetch(\`\${BASE}\${path}\`, { credentials: 'include' });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async post(path, body = null) {
    const res = await fetch(\`\${BASE}\${path}\`, {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async buyNumber(serviceName, countryCode, timeout = 240) {
    const [services, countries] = await Promise.all([
      this.get('/services'),
      this.get('/countries'),
    ]);

    const service = services.find(s => s.slug === serviceName);
    const country = countries.find(c => c.code === countryCode);

    if (!service || !country) throw new Error('Service ou pays introuvable');

    // Vérifier le devis
    const quote = await this.get(
      \`/numbers/quote?serviceId=\${service.id}&countryId=\${country.id}\`
    );
    console.log(\`Prix : \${quote.price} FCFA\`);

    // Acheter le numéro
    const number = await this.post('/numbers', {
      serviceId: service.id,
      countryId: country.id,
    });
    console.log(\`Numéro : \${number.phoneNumber}\`);

    // Attendre le SMS
    const start = Date.now();
    while (Date.now() - start < timeout * 1000) {
      await new Promise(r => setTimeout(r, 5000));
      const data = await this.post(\`/numbers/\${number.id}/poll\`);

      if (data.messages?.length > 0) {
        const code = data.messages[0].code;
        console.log(\`✅ Code reçu : \${code}\`);
        return { number, code };
      }
    }
    throw new Error('Timeout — aucun SMS reçu');
  }
}

// Usage
const client = new SimixClient();
await client.login('+2250701234567', 'motdepasse123');
const { code } = await client.buyNumber('whatsapp', 'ci');
console.log('Code WhatsApp :', code);`,

    python: `# Simix API — Exemple complet Python
# pip install requests

import requests
import time

BASE = '${BASE_URL}'

class SimixClient:
    def __init__(self):
        self.session = requests.Session()

    def login(self, phone, password):
        res = self.session.post(f'{BASE}/auth/login', json={
            'phone': phone, 'password': password,
        })
        res.raise_for_status()
        return res.json()

    def get_services(self):
        return self.session.get(f'{BASE}/services').json()

    def get_countries(self):
        return self.session.get(f'{BASE}/countries').json()

    def buy_number(self, service_slug, country_code, timeout=240):
        services = self.get_services()
        countries = self.get_countries()

        service = next(s for s in services if s['slug'] == service_slug)
        country = next(c for c in countries if c['code'] == country_code)

        # Devis
        quote = self.session.get(f'{BASE}/numbers/quote', params={
            'serviceId': service['id'],
            'countryId': country['id'],
        }).json()
        print(f"Prix : {quote['price']} FCFA")

        # Achat
        number = self.session.post(f'{BASE}/numbers', json={
            'serviceId': service['id'],
            'countryId': country['id'],
        }).json()
        print(f"Numéro : {number['phoneNumber']}")

        # Attente SMS
        start = time.time()
        while time.time() - start < timeout:
            time.sleep(5)
            data = self.session.post(
                f"{BASE}/numbers/{number['id']}/poll"
            ).json()
            if data.get('messages'):
                code = data['messages'][0]['code']
                print(f"✅ Code reçu : {code}")
                return number, code

        raise TimeoutError("Aucun SMS reçu")


# Usage
client = SimixClient()
client.login('+2250701234567', 'motdepasse123')
number, code = client.buy_number('whatsapp', 'ci')
print('Code WhatsApp :', code)`,

    php: `<?php
// Simix API — Exemple complet PHP

define('SIMIX_BASE', '${BASE_URL}');

class SimixClient {
    private $cookieFile;

    public function __construct() {
        $this->cookieFile = tempnam(sys_get_temp_dir(), 'simix_');
    }

    private function request($method, $path, $body = null) {
        $ch = curl_init(SIMIX_BASE . $path);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIEFILE     => $this->cookieFile,
            CURLOPT_COOKIEJAR      => $this->cookieFile,
            CURLOPT_CUSTOMREQUEST  => $method,
        ];
        if ($body) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body);
            $opts[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
        }
        curl_setopt_array($ch, $opts);
        $result = json_decode(curl_exec($ch), true);
        curl_close($ch);
        return $result;
    }

    public function login($phone, $password) {
        return $this->request('POST', '/auth/login', [
            'phone' => $phone, 'password' => $password,
        ]);
    }

    public function buyNumber($serviceSlug, $countryCode) {
        $services = $this->request('GET', '/services');
        $countries = $this->request('GET', '/countries');

        $service = current(array_filter($services,
            fn($s) => $s['slug'] === $serviceSlug));
        $country = current(array_filter($countries,
            fn($c) => $c['code'] === $countryCode));

        $number = $this->request('POST', '/numbers', [
            'serviceId' => $service['id'],
            'countryId' => $country['id'],
        ]);

        echo "Numéro : " . $number['phoneNumber'] . "\\n";

        // Poll pour SMS
        for ($i = 0; $i < 48; $i++) {
            sleep(5);
            $data = $this->request('POST', "/numbers/{$number['id']}/poll");
            if (!empty($data['messages'])) {
                $code = $data['messages'][0]['code'];
                echo "✅ Code : $code\\n";
                return $code;
            }
        }
        throw new Exception("Timeout");
    }
}

$client = new SimixClient();
$client->login('+2250701234567', 'motdepasse123');
$code = $client->buyNumber('whatsapp', 'ci');`,

    curl: `#!/bin/bash
# Simix API — Exemple complet Bash/cURL

BASE="${BASE_URL}"
COOKIES="cookies.txt"

# 1. Connexion
echo "Connexion..."
curl -s -X POST "$BASE/auth/login" \\
  -H "Content-Type: application/json" \\
  -c "$COOKIES" \\
  -d '{"phone":"+2250701234567","password":"motdepasse123"}' | jq .

# 2. Récupérer les IDs
SERVICE_ID=$(curl -s "$BASE/services" -b "$COOKIES" | \\
  jq -r '.[] | select(.slug=="whatsapp") | .id')

COUNTRY_ID=$(curl -s "$BASE/countries" -b "$COOKIES" | \\
  jq -r '.[] | select(.code=="ci") | .id')

echo "Service ID: $SERVICE_ID"
echo "Country ID: $COUNTRY_ID"

# 3. Acheter le numéro
NUMBER=$(curl -s -X POST "$BASE/numbers" \\
  -H "Content-Type: application/json" \\
  -b "$COOKIES" \\
  -d "{\"serviceId\":\"$SERVICE_ID\",\"countryId\":\"$COUNTRY_ID\"}")

NUMBER_ID=$(echo $NUMBER | jq -r '.id')
PHONE=$(echo $NUMBER | jq -r '.phoneNumber')
echo "Numéro attribué : $PHONE"

# 4. Attendre le SMS (poll toutes les 5s)
for i in $(seq 1 48); do
  sleep 5
  RESULT=$(curl -s -X POST "$BASE/numbers/$NUMBER_ID/poll" -b "$COOKIES")
  CODE=$(echo $RESULT | jq -r '.messages[0].code // empty')
  if [ -n "$CODE" ]; then
    echo "✅ Code reçu : $CODE"
    break
  fi
  echo "Attente SMS... ($((i*5))s)"
done`,

    go: `// Simix API — Exemple complet Go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "net/http/cookiejar"
    "time"
)

const BASE = "${BASE_URL}"

type SimixClient struct {
    http *http.Client
}

func NewSimixClient() *SimixClient {
    jar, _ := cookiejar.New(nil)
    return &SimixClient{
        http: &http.Client{Jar: jar, Timeout: 30 * time.Second},
    }
}

func (c *SimixClient) post(path string, body interface{}) (map[string]interface{}, error) {
    b, _ := json.Marshal(body)
    req, _ := http.NewRequest("POST", BASE+path, bytes.NewBuffer(b))
    req.Header.Set("Content-Type", "application/json")
    resp, err := c.http.Do(req)
    if err != nil { return nil, err }
    defer resp.Body.Close()
    var result map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    return result, nil
}

func (c *SimixClient) get(path string) ([]map[string]interface{}, error) {
    resp, err := c.http.Get(BASE + path)
    if err != nil { return nil, err }
    defer resp.Body.Close()
    var result []map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&result)
    return result, nil
}

func main() {
    client := NewSimixClient()

    // Connexion
    client.post("/auth/login", map[string]string{
        "phone":    "+2250701234567",
        "password": "motdepasse123",
    })

    services, _ := client.get("/services")
    countries, _ := client.get("/countries")

    var serviceID, countryID string
    for _, s := range services {
        if s["slug"] == "whatsapp" { serviceID = s["id"].(string) }
    }
    for _, c := range countries {
        if c["code"] == "ci" { countryID = c["id"].(string) }
    }

    // Achat
    number, _ := client.post("/numbers", map[string]string{
        "serviceId": serviceID, "countryId": countryID,
    })
    numberID := number["id"].(string)
    fmt.Println("Numéro :", number["phoneNumber"])

    // Poll
    for i := 0; i < 48; i++ {
        time.Sleep(5 * time.Second)
        data, _ := client.post("/numbers/"+numberID+"/poll", nil)
        if msgs, ok := data["messages"].([]interface{}); ok && len(msgs) > 0 {
            msg := msgs[0].(map[string]interface{})
            fmt.Println("✅ Code :", msg["code"])
            return
        }
    }
    fmt.Println("Timeout — aucun SMS reçu")
}`,
  };

  const langs: Lang[] = ["javascript", "python", "php", "curl", "go"];

  return (
    <div className="space-y-4">
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-bold text-foreground">Exemples complets</h3>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Exemples de bout en bout : connexion → achat de numéro → attente SMS → récupération du code.
        </p>
      </div>

      <LangTabs langs={langs} active={lang} onChange={setLang} />
      <CodeBlock code={fullExamples[lang]} id={`sdk-${lang}`} lang={lang} />

      {/* Librairies recommandées */}
      <div className="bg-card border border-card-border rounded-2xl p-4">
        <p className="text-sm font-bold text-foreground mb-3">Librairies recommandées</p>
        <div className="space-y-2">
          {[
            { lang: "JavaScript", lib: "axios ou fetch natif", install: "npm install axios" },
            { lang: "Python", lib: "requests", install: "pip install requests" },
            { lang: "PHP", lib: "Guzzle ou cURL", install: "composer require guzzlehttp/guzzle" },
            { lang: "Go", lib: "net/http (stdlib)", install: "— standard library" },
          ].map(l => (
            <div key={l.lang} className="flex items-center justify-between py-2 border-b border-card-border/40 last:border-0">
              <div>
                <p className="text-[12px] font-bold text-foreground">{l.lang}</p>
                <p className="text-[11px] text-muted-foreground">{l.lib}</p>
              </div>
              <code className="font-mono text-[10px] bg-secondary px-2 py-1 rounded-lg text-violet-300">{l.install}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── API Explorer ────────────────────────────────────────────────────── */
function ApiExplorer({ onClose }: { onClose: () => void }) {
  const [endpoint, setEndpoint] = useState("me");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);

  const explorerEndpoints = [
    { id: "me", label: "GET /auth/me", url: "/auth/me", method: "GET" },
    { id: "services", label: "GET /services", url: "/services", method: "GET" },
    { id: "countries", label: "GET /countries", url: "/countries", method: "GET" },
    { id: "active", label: "GET /numbers/active", url: "/numbers/active", method: "GET" },
    { id: "transactions", label: "GET /wallet/transactions", url: "/wallet/transactions", method: "GET" },
  ];

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const selected = explorerEndpoints.find(e => e.id === endpoint)!;

  const run = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch(`${BASE}/api${selected.url}`, {
        method: selected.method,
        credentials: "include",
      });
      setStatus(res.status);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (e) {
      setResponse(`Erreur: ${(e as Error).message}`);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-card-border bg-card sticky top-0">
        <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
        <div>
          <p className="text-sm font-bold text-foreground">Console API</p>
          <p className="text-[10px] text-muted-foreground">Testez les endpoints en live</p>
        </div>
        <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Endpoint selector */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Endpoint</p>
          <select
            value={endpoint}
            onChange={e => { setEndpoint(e.target.value); setResponse(null); }}
            className="w-full bg-card border border-card-border rounded-xl px-3 py-3 text-[12px] font-mono text-foreground focus:outline-none focus:border-violet-500"
          >
            {explorerEndpoints.map(e => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </div>

        {/* Info */}
        <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl p-3">
          <p className="text-[11px] text-violet-300">
            <Shield className="w-3.5 h-3.5 inline mr-1" />
            Utilise votre session active — requête authentifiée automatiquement.
          </p>
        </div>

        {/* Run button */}
        <button
          onClick={run}
          disabled={loading}
          className="w-full h-12 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {loading ? "Envoi en cours..." : "Envoyer la requête"}
        </button>

        {/* Response */}
        {response && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Réponse</p>
              {status && (
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${status < 300 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                  {status}
                </span>
              )}
            </div>
            <CodeBlock code={response} id="explorer-response" lang="json" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */
export default function ProfileApiDocs() {
  return (
    <AuthGuard>
      <AppLayout>
        <ApiDocsContent />
      </AppLayout>
    </AuthGuard>
  );
}

function ApiDocsContent() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState("quickstart");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const currentSectionIdx = SECTIONS.findIndex(s => s.id === activeSection);
  const prevSection = currentSectionIdx > 0 ? SECTIONS[currentSectionIdx - 1] : null;
  const nextSection = currentSectionIdx < SECTIONS.length - 1 ? SECTIONS[currentSectionIdx + 1] : null;

  const filteredEndpoints = useMemo(() => {
    if (!searchQuery) return ENDPOINTS;
    const q = searchQuery.toLowerCase();
    return ENDPOINTS.filter(
      e => e.title.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const scrollTabIntoView = (id: string) => {
    const btn = tabsRef.current?.querySelector(`[data-id="${id}"]`);
    btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const changeSection = (id: string) => {
    setActiveSection(id);
    scrollTabIntoView(id);
  };

  const toggleSearch = () => {
    setShowSearch(s => !s);
    if (!showSearch) setTimeout(() => searchRef.current?.focus(), 100);
    else setSearchQuery("");
  };

  const renderSection = () => {
    if (searchQuery) {
      if (filteredEndpoints.length === 0) {
        return (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold text-foreground">Aucun résultat</p>
            <p className="text-[12px] text-muted-foreground mt-1">Essayez un autre terme de recherche</p>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">{filteredEndpoints.length} résultat{filteredEndpoints.length > 1 ? "s" : ""} pour « {searchQuery} »</p>
          {filteredEndpoints.map(ep => <EndpointCard key={ep.id} ep={ep} />)}
        </div>
      );
    }

    switch (activeSection) {
      case "quickstart": return <SectionQuickstart />;
      case "auth": return <SectionAuth />;
      case "countries": return (
        <div className="space-y-3">
          {ENDPOINTS.filter(e => ["get-countries"].includes(e.id)).map(ep => <EndpointCard key={ep.id} ep={ep} />)}
        </div>
      );
      case "services": return (
        <div className="space-y-3">
          {ENDPOINTS.filter(e => ["get-services"].includes(e.id)).map(ep => <EndpointCard key={ep.id} ep={ep} />)}
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <p className="text-sm font-bold text-foreground mb-3">Services disponibles</p>
            <div className="grid grid-cols-2 gap-2">
              {["WhatsApp", "Telegram", "Google", "Facebook", "Instagram", "Discord", "TikTok", "X (Twitter)", "Signal", "Apple", "Microsoft", "Snapchat"].map(s => (
                <div key={s} className="flex items-center gap-2 bg-secondary/50 rounded-xl px-3 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-[11px] font-medium text-foreground">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      case "numbers": return <SectionNumbers />;
      case "sms": return (
        <div className="space-y-4">
          {ENDPOINTS.filter(e => ["poll-number"].includes(e.id)).map(ep => <EndpointCard key={ep.id} ep={ep} />)}
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-2">Format d'un SMS</h3>
            <CodeBlock id="sms-format" lang="json" code={`{
  "id": "uuid-sms",
  "numberId": "uuid-numero",
  "sender": "Whatsapp",
  "body": "Your WhatsApp code is 847291. Don't share this code with others.",
  "code": "847291",
  "receivedAt": "2026-01-01T00:05:32.000Z"
}`} />
          </div>
          <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4">
            <p className="text-sm font-bold text-amber-300 mb-2">⚡ Extraction automatique du code</p>
            <p className="text-[12px] text-muted-foreground">Le champ <code className="font-mono bg-secondary px-1 rounded">code</code> contient le code extrait automatiquement du message SMS par regex (<code className="font-mono bg-secondary px-1 rounded">\d&#123;4,8&#125;</code>).</p>
          </div>
        </div>
      );
      case "wallet": return (
        <div className="space-y-3">
          {ENDPOINTS.filter(e => ["get-balance", "get-transactions"].includes(e.id)).map(ep => <EndpointCard key={ep.id} ep={ep} />)}
          <div className="bg-card border border-card-border rounded-2xl p-4">
            <p className="text-sm font-bold text-foreground mb-3">Types de transactions</p>
            <div className="space-y-2">
              {[
                { type: "recharge", color: "text-emerald-400", desc: "Recharge wallet (Orange Money, MTN, Wave)" },
                { type: "purchase", color: "text-violet-400", desc: "Achat de numéro virtuel" },
                { type: "refund", color: "text-blue-400", desc: "Remboursement suite à annulation" },
                { type: "referral_commission", color: "text-amber-400", desc: "Commission de parrainage reçue" },
              ].map(t => (
                <div key={t.type} className="flex items-center gap-3">
                  <span className={`font-mono text-[10px] font-bold ${t.color}`}>{t.type}</span>
                  <span className="text-[11px] text-muted-foreground">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      case "webhooks": return <SectionWebhooks />;
      case "errors": return <SectionErrors />;
      case "sdk": return <SectionSDK />;
      default: return null;
    }
  };

  return (
    <div className="flex-1 w-full bg-background overflow-hidden flex flex-col">
      {/* Explorer overlay */}
      {showExplorer && <ApiExplorer onClose={() => setShowExplorer(false)} />}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-card-border/50">
        <AnimatePresence mode="wait">
          {showSearch ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher un endpoint..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button onClick={toggleSearch} className="w-8 h-8 bg-secondary rounded-xl flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="header"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-4 pt-6 pb-3"
            >
              <button
                onClick={() => setLocation("/profile")}
                className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-foreground" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-foreground truncate">Documentation API</h1>
                <p className="text-[10px] text-muted-foreground font-mono">REST API · {API_VERSION}</p>
              </div>
              <button
                onClick={toggleSearch}
                className="w-9 h-9 bg-card border border-card-border rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
              >
                <Search className="w-4 h-4 text-muted-foreground" />
              </button>
              <button
                onClick={() => setShowExplorer(true)}
                className="w-9 h-9 bg-violet-600/20 border border-violet-500/30 rounded-xl flex items-center justify-center hover:bg-violet-600/30 transition-colors"
              >
                <Terminal className="w-4 h-4 text-violet-400" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section tabs */}
        {!searchQuery && (
          <div
            ref={tabsRef}
            className="flex gap-1.5 px-4 pb-3 overflow-x-auto hide-scrollbar"
          >
            {SECTIONS.map(s => (
              <button
                key={s.id}
                data-id={s.id}
                onClick={() => changeSection(s.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  activeSection === s.id
                    ? "bg-violet-600 text-white shadow-md shadow-violet-500/25"
                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                }`}
              >
                <s.icon className="w-3 h-3" />
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
        {/* Section header */}
        {!searchQuery && (
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-4">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                <span>Simix API</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-violet-400 font-medium">
                  {SECTIONS.find(s => s.id === activeSection)?.label}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {SECTIONS.find(s => s.id === activeSection)?.description}
              </p>
            </div>
            {renderSection()}
          </motion.div>
        )}

        {searchQuery && renderSection()}

        {/* Prev / Next navigation */}
        {!searchQuery && (prevSection || nextSection) && (
          <div className="flex gap-3 mt-6">
            {prevSection && (
              <button
                onClick={() => changeSection(prevSection.id)}
                className="flex-1 flex items-center gap-2 px-4 py-3 bg-card border border-card-border rounded-2xl hover:bg-secondary/40 transition-colors text-left"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Précédent</p>
                  <p className="text-[12px] font-bold text-foreground truncate">{prevSection.label}</p>
                </div>
              </button>
            )}
            {nextSection && (
              <button
                onClick={() => changeSection(nextSection.id)}
                className="flex-1 flex items-center justify-end gap-2 px-4 py-3 bg-card border border-card-border rounded-2xl hover:bg-secondary/40 transition-colors text-right"
              >
                <div className="min-w-0">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Suivant</p>
                  <p className="text-[12px] font-bold text-foreground truncate">{nextSection.label}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-card-border/40 text-center">
          <p className="text-[10px] text-muted-foreground/50">
            Simix API · REST · JSON · TLS 1.3
          </p>
        </div>
      </div>
    </div>
  );
}
