/**
 * Ancien outil désactivé volontairement.
 *
 * Les OTP ne doivent jamais contourner emailService ni être renvoyés en masse
 * depuis un script autonome. Utiliser les parcours OTP de l'API Simix, qui
 * créent un nouveau code à durée limitée et passent par Brevo puis Resend.
 */
throw new Error(
  "Commande désactivée : utilisez les endpoints OTP de l'API Simix via l'application.",
);