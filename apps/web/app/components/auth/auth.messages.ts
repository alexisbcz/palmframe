import { defineMessages } from "@/i18n/core"

// `{terms}`, `{privacy}` and `{email}` are filled with links or bold text.
export const messages = defineMessages({
  en: {
    signup: {
      meta: "Create your account",
      title: "Create your account",
      magicHint: "No password: we email you a link.",
      passwordHint: "Write, draw and publish your comics.",
      name: "Name",
      namePlaceholder: "Camille Martin",
      submit: "Create my account",
      usePassword: "Choose a password instead",
      haveAccount: "Already have an account?",
      signIn: "Sign in",
      legal:
        "By creating an account, you agree to our {terms} and our {privacy}.",
    },
    login: {
      meta: "Sign in",
      title: "Welcome back",
      magicHint: "No password: we email you a link.",
      passwordHint: "Sign in to get back to your comics.",
      sendLink: "Email me a sign-in link",
      withPassword: "Sign in with a password",
      forgot: "Forgot password?",
      submit: "Sign in",
      noAccount: "No account yet?",
      createAccount: "Create an account",
      legal: "By continuing, you agree to our {terms} and our {privacy}.",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      useLink: "Email me a link instead",
    },
    sent: {
      title: "Check your inbox",
      link: "We sent a sign-in link to {email}. Open it in this browser to sign in.",
      confirm:
        "We sent a link to confirm your address to {email}. Open it in this browser to finish.",
      reset: "We sent a link to choose a new password to {email}.",
      resend: "Resend",
      resent: "Sent again.",
      otherAddress: "Use another address",
    },
    reset: {
      meta: "New password",
      title: "Choose a new password",
      hint: "At least 8 characters.",
      password: "New password",
      submit: "Save password",
      signedOut:
        "This link has expired or was already used. Ask for a new one.",
      newLink: "Get a new link",
    },
    errors: {
      invalidCredentials: "Wrong email or password.",
      notConfirmed: "Confirm your address first: the link is in your inbox.",
      noAccount: "No account uses this address.",
      expired: "This link has expired or was already used. Ask for a new one.",
      otherBrowser: "Open the link in the browser where you asked for it.",
      samePassword: "Choose a password different from the old one.",
      exists: "An account already uses this address.",
      rateLimit: "Too many attempts. Try again in a few minutes.",
      tooShort: "The password needs at least 8 characters.",
      wait: "Wait a minute before asking for another email.",
      generic: "Something went wrong. Try again.",
    },
    legal: {
      terms: "terms of use",
      privacy: "privacy policy",
      back: "Back to home",
      termsTitle: "Terms of use",
      termsP1:
        "Palmframe lets you write, draw and publish comics. You keep ownership of what you make. When you post a comic, you allow Palmframe to show it.",
      termsP2:
        "Only publish what you have the right to share: nothing illegal or hateful, and nothing that shows minors in a sexual way.",
      termsP3:
        "We can remove content or close an account that breaks these rules. The service is provided as is, with no guarantee that it is always available.",
      privacyTitle: "Privacy policy",
      privacyP1:
        "We keep your email address, your name and what you make in the editor, to run your account. We never sell or share any of it for advertising.",
      privacyP2:
        "Supabase stores accounts, projects and images, and Vercel hosts the site, for this service only. When you post to Instagram, the images go through Zernio.",
      privacyP3:
        "You can ask us to export or delete your data at any time by writing to us.",
    },
  },
  fr: {
    signup: {
      meta: "Créer votre compte",
      title: "Créer votre compte",
      magicHint: "Pas de mot de passe : nous vous envoyons un lien.",
      passwordHint: "Écrivez, dessinez et publiez vos bandes dessinées.",
      name: "Nom",
      namePlaceholder: "Camille Martin",
      submit: "Créer mon compte",
      usePassword: "Choisir un mot de passe plutôt",
      haveAccount: "Déjà un compte ?",
      signIn: "Se connecter",
      legal:
        "En créant un compte, vous acceptez nos {terms} et notre {privacy}.",
    },
    login: {
      meta: "Connexion",
      title: "Bon retour",
      magicHint: "Pas de mot de passe : nous vous envoyons un lien.",
      passwordHint: "Connectez-vous pour retrouver vos bandes dessinées.",
      sendLink: "Recevoir un lien de connexion",
      withPassword: "Se connecter avec un mot de passe",
      forgot: "Mot de passe oublié ?",
      submit: "Se connecter",
      noAccount: "Pas encore de compte ?",
      createAccount: "Créer un compte",
      legal: "En continuant, vous acceptez nos {terms} et notre {privacy}.",
    },
    fields: {
      email: "E-mail",
      emailPlaceholder: "vous@exemple.fr",
      password: "Mot de passe",
      useLink: "Recevoir plutôt un lien par e-mail",
    },
    sent: {
      title: "Vérifiez votre boîte mail",
      link: "Nous avons envoyé un lien de connexion à {email}. Ouvrez-le dans ce navigateur pour vous connecter.",
      confirm:
        "Nous avons envoyé un lien pour confirmer votre adresse à {email}. Ouvrez-le dans ce navigateur pour terminer.",
      reset:
        "Nous avons envoyé un lien pour choisir un nouveau mot de passe à {email}.",
      resend: "Renvoyer",
      resent: "C’est renvoyé.",
      otherAddress: "Utiliser une autre adresse",
    },
    reset: {
      meta: "Nouveau mot de passe",
      title: "Choisir un nouveau mot de passe",
      hint: "Au moins 8 caractères.",
      password: "Nouveau mot de passe",
      submit: "Enregistrer le mot de passe",
      signedOut: "Ce lien a expiré ou a déjà servi : demandez-en un nouveau.",
      newLink: "Recevoir un nouveau lien",
    },
    errors: {
      invalidCredentials: "E-mail ou mot de passe incorrect.",
      notConfirmed:
        "Confirmez d’abord votre adresse : le lien est dans votre boîte mail.",
      noAccount: "Aucun compte avec cette adresse.",
      expired: "Ce lien a expiré ou a déjà servi : demandez-en un nouveau.",
      otherBrowser: "Ouvrez le lien dans le navigateur où vous l’avez demandé.",
      samePassword: "Choisissez un mot de passe différent de l’ancien.",
      exists: "Un compte existe déjà avec cette adresse.",
      rateLimit: "Trop de tentatives : réessayez dans quelques minutes.",
      tooShort: "Le mot de passe doit faire au moins 8 caractères.",
      wait: "Patientez une minute avant de redemander un e-mail.",
      generic: "Une erreur est survenue. Réessayez.",
    },
    legal: {
      terms: "conditions d’utilisation",
      privacy: "politique de confidentialité",
      back: "Retour à l’accueil",
      termsTitle: "Conditions d’utilisation",
      termsP1:
        "Palmframe permet d’écrire, de dessiner et de publier des bandes dessinées. Vous restez propriétaire de ce que vous créez ; en publiant une BD, vous autorisez Palmframe à l’afficher.",
      termsP2:
        "Vous vous engagez à ne publier que des contenus que vous avez le droit de diffuser, et aucun contenu illégal, haineux ou sexualisant des mineurs.",
      termsP3:
        "Nous pouvons retirer un contenu ou fermer un compte qui ne respecte pas ces règles. Le service est fourni tel quel, sans garantie de disponibilité.",
      privacyTitle: "Politique de confidentialité",
      privacyP1:
        "Nous conservons votre adresse e-mail, votre nom et ce que vous créez dans l’éditeur, pour faire fonctionner votre compte. Rien n’est revendu ni partagé à des fins publicitaires.",
      privacyP2:
        "Supabase stocke les comptes, les projets et les images, et Vercel héberge le site, dans le cadre de ce service uniquement. Quand vous publiez sur Instagram, les images passent par Zernio.",
      privacyP3:
        "Vous pouvez demander l’export ou la suppression de vos données à tout moment en nous écrivant.",
    },
  },
  es: {
    signup: {
      meta: "Crea tu cuenta",
      title: "Crea tu cuenta",
      magicHint: "Sin contraseña: te enviamos un enlace.",
      passwordHint: "Escribe, dibuja y publica tus cómics.",
      name: "Nombre",
      namePlaceholder: "Camila Martín",
      submit: "Crear mi cuenta",
      usePassword: "Prefiero elegir una contraseña",
      haveAccount: "¿Ya tienes cuenta?",
      signIn: "Iniciar sesión",
      legal:
        "Al crear una cuenta, aceptas nuestras {terms} y nuestra {privacy}.",
    },
    login: {
      meta: "Iniciar sesión",
      title: "Hola de nuevo",
      magicHint: "Sin contraseña: te enviamos un enlace.",
      passwordHint: "Inicia sesión para volver a tus cómics.",
      sendLink: "Recibir un enlace de acceso",
      withPassword: "Iniciar sesión con contraseña",
      forgot: "¿Olvidaste la contraseña?",
      submit: "Iniciar sesión",
      noAccount: "¿Aún no tienes cuenta?",
      createAccount: "Crear una cuenta",
      legal: "Al continuar, aceptas nuestras {terms} y nuestra {privacy}.",
    },
    fields: {
      email: "Correo electrónico",
      emailPlaceholder: "tu@ejemplo.es",
      password: "Contraseña",
      useLink: "Prefiero recibir un enlace por correo",
    },
    sent: {
      title: "Revisa tu correo",
      link: "Hemos enviado un enlace de acceso a {email}. Ábrelo en este navegador para iniciar sesión.",
      confirm:
        "Hemos enviado un enlace para confirmar tu dirección a {email}. Ábrelo en este navegador para terminar.",
      reset:
        "Hemos enviado un enlace para elegir una contraseña nueva a {email}.",
      resend: "Reenviar",
      resent: "Enviado de nuevo.",
      otherAddress: "Usar otra dirección",
    },
    reset: {
      meta: "Contraseña nueva",
      title: "Elige una contraseña nueva",
      hint: "Al menos 8 caracteres.",
      password: "Contraseña nueva",
      submit: "Guardar contraseña",
      signedOut: "Este enlace ha caducado o ya se usó. Pide uno nuevo.",
      newLink: "Recibir un enlace nuevo",
    },
    errors: {
      invalidCredentials: "Correo o contraseña incorrectos.",
      notConfirmed:
        "Confirma primero tu dirección: el enlace está en tu correo.",
      noAccount: "No hay ninguna cuenta con esta dirección.",
      expired: "Este enlace ha caducado o ya se usó. Pide uno nuevo.",
      otherBrowser: "Abre el enlace en el navegador donde lo pediste.",
      samePassword: "Elige una contraseña distinta de la anterior.",
      exists: "Ya existe una cuenta con esta dirección.",
      rateLimit: "Demasiados intentos. Vuelve a probar en unos minutos.",
      tooShort: "La contraseña necesita al menos 8 caracteres.",
      wait: "Espera un minuto antes de pedir otro correo.",
      generic: "Algo ha fallado. Inténtalo de nuevo.",
    },
    legal: {
      terms: "condiciones de uso",
      privacy: "política de privacidad",
      back: "Volver al inicio",
      termsTitle: "Condiciones de uso",
      termsP1:
        "Palmframe te permite escribir, dibujar y publicar cómics. Lo que creas sigue siendo tuyo. Al publicar un cómic, permites que Palmframe lo muestre.",
      termsP2:
        "Publica solo lo que tengas derecho a difundir: nada ilegal ni de odio, y nada que sexualice a menores.",
      termsP3:
        "Podemos retirar contenido o cerrar una cuenta que incumpla estas normas. El servicio se ofrece tal cual, sin garantía de disponibilidad.",
      privacyTitle: "Política de privacidad",
      privacyP1:
        "Guardamos tu correo, tu nombre y lo que creas en el editor para que tu cuenta funcione. Nunca lo vendemos ni lo compartimos con fines publicitarios.",
      privacyP2:
        "Supabase guarda las cuentas, los proyectos y las imágenes, y Vercel aloja el sitio, solo para este servicio. Cuando publicas en Instagram, las imágenes pasan por Zernio.",
      privacyP3:
        "Puedes pedirnos en cualquier momento que exportemos o borremos tus datos escribiéndonos.",
    },
  },
  de: {
    signup: {
      meta: "Konto erstellen",
      title: "Konto erstellen",
      magicHint: "Kein Passwort: Wir schicken dir einen Link.",
      passwordHint: "Schreibe, zeichne und veröffentliche deine Comics.",
      name: "Name",
      namePlaceholder: "Camille Martin",
      submit: "Konto erstellen",
      usePassword: "Lieber ein Passwort wählen",
      haveAccount: "Schon ein Konto?",
      signIn: "Anmelden",
      legal:
        "Mit dem Erstellen eines Kontos akzeptierst du unsere {terms} und unsere {privacy}.",
    },
    login: {
      meta: "Anmelden",
      title: "Willkommen zurück",
      magicHint: "Kein Passwort: Wir schicken dir einen Link.",
      passwordHint: "Melde dich an, um zu deinen Comics zurückzukehren.",
      sendLink: "Anmeldelink schicken",
      withPassword: "Mit Passwort anmelden",
      forgot: "Passwort vergessen?",
      submit: "Anmelden",
      noAccount: "Noch kein Konto?",
      createAccount: "Konto erstellen",
      legal:
        "Wenn du fortfährst, akzeptierst du unsere {terms} und unsere {privacy}.",
    },
    fields: {
      email: "E-Mail",
      emailPlaceholder: "du@beispiel.de",
      password: "Passwort",
      useLink: "Lieber einen Link per E-Mail",
    },
    sent: {
      title: "Sieh in deinem Postfach nach",
      link: "Wir haben einen Anmeldelink an {email} geschickt. Öffne ihn in diesem Browser, um dich anzumelden.",
      confirm:
        "Wir haben einen Link zur Bestätigung deiner Adresse an {email} geschickt. Öffne ihn in diesem Browser, um fertig zu werden.",
      reset:
        "Wir haben einen Link für ein neues Passwort an {email} geschickt.",
      resend: "Erneut senden",
      resent: "Erneut gesendet.",
      otherAddress: "Andere Adresse verwenden",
    },
    reset: {
      meta: "Neues Passwort",
      title: "Neues Passwort wählen",
      hint: "Mindestens 8 Zeichen.",
      password: "Neues Passwort",
      submit: "Passwort speichern",
      signedOut:
        "Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.",
      newLink: "Neuen Link anfordern",
    },
    errors: {
      invalidCredentials: "E-Mail oder Passwort falsch.",
      notConfirmed:
        "Bestätige zuerst deine Adresse: Der Link ist in deinem Postfach.",
      noAccount: "Kein Konto mit dieser Adresse.",
      expired:
        "Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.",
      otherBrowser:
        "Öffne den Link in dem Browser, in dem du ihn angefordert hast.",
      samePassword: "Wähle ein anderes Passwort als das alte.",
      exists: "Mit dieser Adresse gibt es schon ein Konto.",
      rateLimit:
        "Zu viele Versuche. Versuche es in ein paar Minuten noch einmal.",
      tooShort: "Das Passwort braucht mindestens 8 Zeichen.",
      wait: "Warte eine Minute, bevor du eine weitere E-Mail anforderst.",
      generic: "Etwas ist schiefgelaufen. Versuche es noch einmal.",
    },
    legal: {
      terms: "Nutzungsbedingungen",
      privacy: "Datenschutzerklärung",
      back: "Zurück zur Startseite",
      termsTitle: "Nutzungsbedingungen",
      termsP1:
        "Mit Palmframe schreibst, zeichnest und veröffentlichst du Comics. Was du erstellst, gehört dir. Wenn du einen Comic veröffentlichst, erlaubst du Palmframe, ihn zu zeigen.",
      termsP2:
        "Veröffentliche nur, was du verbreiten darfst: nichts Illegales, nichts Hasserfülltes und nichts, was Minderjährige sexualisiert.",
      termsP3:
        "Wir können Inhalte entfernen oder ein Konto schließen, das gegen diese Regeln verstößt. Der Dienst wird ohne Gewähr für seine Verfügbarkeit bereitgestellt.",
      privacyTitle: "Datenschutzerklärung",
      privacyP1:
        "Wir speichern deine E-Mail-Adresse, deinen Namen und was du im Editor erstellst, damit dein Konto funktioniert. Nichts davon wird verkauft oder für Werbung geteilt.",
      privacyP2:
        "Supabase speichert Konten, Projekte und Bilder, Vercel hostet die Website, nur für diesen Dienst. Wenn du auf Instagram postest, laufen die Bilder über Zernio.",
      privacyP3:
        "Du kannst jederzeit per Nachricht an uns den Export oder die Löschung deiner Daten verlangen.",
    },
  },
  it: {
    signup: {
      meta: "Crea il tuo account",
      title: "Crea il tuo account",
      magicHint: "Niente password: ti mandiamo un link.",
      passwordHint: "Scrivi, disegna e pubblica i tuoi fumetti.",
      name: "Nome",
      namePlaceholder: "Camilla Martini",
      submit: "Crea il mio account",
      usePassword: "Preferisco scegliere una password",
      haveAccount: "Hai già un account?",
      signIn: "Accedi",
      legal:
        "Creando un account, accetti i nostri {terms} e la nostra {privacy}.",
    },
    login: {
      meta: "Accedi",
      title: "Bentornato",
      magicHint: "Niente password: ti mandiamo un link.",
      passwordHint: "Accedi per ritrovare i tuoi fumetti.",
      sendLink: "Ricevi un link di accesso",
      withPassword: "Accedi con una password",
      forgot: "Password dimenticata?",
      submit: "Accedi",
      noAccount: "Non hai ancora un account?",
      createAccount: "Crea un account",
      legal: "Continuando, accetti i nostri {terms} e la nostra {privacy}.",
    },
    fields: {
      email: "Email",
      emailPlaceholder: "tu@esempio.it",
      password: "Password",
      useLink: "Preferisco ricevere un link via email",
    },
    sent: {
      title: "Controlla la tua casella",
      link: "Abbiamo inviato un link di accesso a {email}. Aprilo in questo browser per accedere.",
      confirm:
        "Abbiamo inviato un link per confermare l’indirizzo a {email}. Aprilo in questo browser per finire.",
      reset:
        "Abbiamo inviato un link per scegliere una nuova password a {email}.",
      resend: "Invia di nuovo",
      resent: "Inviato di nuovo.",
      otherAddress: "Usa un altro indirizzo",
    },
    reset: {
      meta: "Nuova password",
      title: "Scegli una nuova password",
      hint: "Almeno 8 caratteri.",
      password: "Nuova password",
      submit: "Salva la password",
      signedOut:
        "Questo link è scaduto o è già stato usato. Chiedine uno nuovo.",
      newLink: "Ricevi un nuovo link",
    },
    errors: {
      invalidCredentials: "Email o password errate.",
      notConfirmed: "Conferma prima l’indirizzo: il link è nella tua casella.",
      noAccount: "Nessun account con questo indirizzo.",
      expired: "Questo link è scaduto o è già stato usato. Chiedine uno nuovo.",
      otherBrowser: "Apri il link nel browser in cui l’hai richiesto.",
      samePassword: "Scegli una password diversa da quella vecchia.",
      exists: "Esiste già un account con questo indirizzo.",
      rateLimit: "Troppi tentativi. Riprova tra qualche minuto.",
      tooShort: "La password deve avere almeno 8 caratteri.",
      wait: "Aspetta un minuto prima di chiedere un’altra email.",
      generic: "Qualcosa è andato storto. Riprova.",
    },
    legal: {
      terms: "termini d’uso",
      privacy: "informativa sulla privacy",
      back: "Torna alla home",
      termsTitle: "Termini d’uso",
      termsP1:
        "Palmframe ti permette di scrivere, disegnare e pubblicare fumetti. Ciò che crei resta tuo. Pubblicando un fumetto, autorizzi Palmframe a mostrarlo.",
      termsP2:
        "Pubblica solo ciò che hai il diritto di diffondere: niente di illegale o d’odio, e niente che sessualizzi minori.",
      termsP3:
        "Possiamo rimuovere contenuti o chiudere un account che viola queste regole. Il servizio è fornito così com’è, senza garanzia di disponibilità.",
      privacyTitle: "Informativa sulla privacy",
      privacyP1:
        "Conserviamo la tua email, il tuo nome e ciò che crei nell’editor per far funzionare il tuo account. Non vendiamo né condividiamo nulla a fini pubblicitari.",
      privacyP2:
        "Supabase conserva account, progetti e immagini, e Vercel ospita il sito, solo per questo servizio. Quando pubblichi su Instagram, le immagini passano da Zernio.",
      privacyP3:
        "Puoi chiederci in qualsiasi momento di esportare o cancellare i tuoi dati scrivendoci.",
    },
  },
})
