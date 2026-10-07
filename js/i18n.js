/* i18n.js — interface strings, English and French.
 *
 * Markup carries the keys: data-i18n for text, data-i18n-title for tooltips,
 * data-i18n-aria for accessible names. apply() walks the page and fills them,
 * so switching language never reloads anything.
 *
 * Data modules (scales.js, audio.js) stay monolingual on purpose: they hold
 * English names, and the French labels live here, keyed by id. That keeps the
 * audio and theory code free of any presentation concern.
 */
window.PM = window.PM || {};
PM.i18n = (function () {
  const DICT = {
    /* ---------- shell ---------- */
    'brand.a': { en: 'Paint', fr: 'Peindre' },
    'brand.b': { en: 'the music', fr: 'la musique' },
    'lang.name': { en: 'FR', fr: 'EN' },
    'lang.title': { en: 'Passer en français', fr: 'Switch to English' },

    /* ---------- transport ---------- */
    't.rewind': { en: 'Back to the start', fr: 'Retour au début' },
    't.play': { en: 'Play (Space)', fr: 'Lecture (Espace)' },
    'a.play': { en: 'Play', fr: 'Lecture' },
    'a.stop': { en: 'Stop', fr: 'Arrêt' },
    'lbl.tempo': { en: 'Tempo', fr: 'Tempo' },
    'btn.tap': { en: 'Tap', fr: 'Tap' },
    't.countin': { en: 'Count-in before playing', fr: 'Décompte avant lecture' },
    'lbl.pages': { en: 'Pages', fr: 'Pages' },
    'btn.duplicate': { en: 'Duplicate', fr: 'Dupliquer' },
    't.duplicate': { en: 'Copy this page into the first free one', fr: 'Copier cette page dans la première page libre' },
    'lbl.song': { en: 'Song', fr: 'Morceau' },
    'btn.chain': { en: 'Chain', fr: 'Suite' },
    't.chain': { en: 'Play the arrangement instead of the single page', fr: "Jouer l'arrangement au lieu de la page seule" },
    't.songadd': { en: 'Add a link', fr: 'Ajouter un maillon' },
    't.songdel': { en: 'Remove the last link', fr: 'Retirer le dernier maillon' },
    'btn.all': { en: 'All', fr: 'Tout' },
    't.songfill': { en: 'Every non-empty page', fr: 'Toutes les pages non vides' },
    'lbl.perform': { en: 'Perform', fr: 'Jeu' },
    'btn.keyboard': { en: 'Keyboard', fr: 'Clavier' },
    't.keyboard': { en: 'Play with the computer keyboard', fr: "Jouer au clavier de l'ordinateur" },
    'btn.rec': { en: 'Rec', fr: 'Rec' },
    't.rec': { en: 'Record what you play', fr: "Enregistrer ce qu'on joue" },
    't.theme': { en: 'Light or dark theme', fr: 'Thème clair ou sombre' },
    't.themedark': { en: 'Switch to the dark theme', fr: 'Passer au thème sombre' },
    't.themelight': { en: 'Switch to the light theme', fr: 'Passer au thème clair' },
    't.zoomout': { en: 'Zoom out (-)', fr: 'Dézoomer (-)' },
    't.zoomin': { en: 'Zoom in (+)', fr: 'Zoomer (+)' },
    'btn.fit': { en: 'Fit', fr: 'Ajuster' },
    't.fit': { en: 'Show everything (0)', fr: 'Tout afficher (0)' },

    /* ---------- tools ---------- */
    't.brush': { en: 'Brush (B)', fr: 'Pinceau (B)' },
    't.eraser': { en: 'Eraser (E)', fr: 'Gomme (E)' },
    't.select': { en: 'Selection (S)', fr: 'Sélection (S)' },
    't.notetool': { en: 'Note: grab it, stretch it by the edges, move it (N)', fr: 'Note : saisir, étirer par les bords, déplacer (N)' },
    't.undo': { en: 'Undo (Ctrl+Z)', fr: 'Annuler (Ctrl+Z)' },
    't.redo': { en: 'Redo (Ctrl+Shift+Z)', fr: 'Rétablir (Ctrl+Maj+Z)' },
    't.shuffle': { en: 'Random pattern', fr: 'Motif aléatoire' },
    't.clear': { en: 'Clear the page', fr: 'Vider la page' },
    't.grid': { en: 'Show the grid (G)', fr: 'Afficher la grille (G)' },
    't.brush1': { en: 'Fine brush', fr: 'Pinceau fin' },
    't.brush2': { en: 'Medium brush', fr: 'Pinceau moyen' },
    't.brush3': { en: 'Wide brush', fr: 'Pinceau large' },
    'a.stage': { en: 'Canvas: arrow keys move the cursor, Enter places a note', fr: 'Toile : flèches pour déplacer le curseur, Entrée pour poser une note' },

    /* ---------- selection bar ---------- */
    'sel.title': { en: 'Selection', fr: 'Sélection' },
    'sel.all': { en: 'All', fr: 'Tout' },
    't.selall': { en: 'Select everything (Ctrl+A)', fr: 'Tout sélectionner (Ctrl+A)' },
    'sel.none': { en: 'None', fr: 'Rien' },
    't.selnone': { en: 'Deselect (Esc)', fr: 'Désélectionner (Échap)' },
    'sel.cut': { en: 'Cut', fr: 'Couper' },
    't.selcut': { en: 'Cut (Ctrl+X)', fr: 'Couper (Ctrl+X)' },
    'sel.copy': { en: 'Copy', fr: 'Copier' },
    't.selcopy': { en: 'Copy (Ctrl+C)', fr: 'Copier (Ctrl+C)' },
    'sel.paste': { en: 'Paste', fr: 'Coller' },
    't.selpaste': { en: 'Paste (Ctrl+V)', fr: 'Coller (Ctrl+V)' },
    'sel.erase': { en: 'Erase', fr: 'Effacer' },
    't.selerase': { en: 'Erase (Del)', fr: 'Effacer (Suppr)' },
    't.selup': { en: 'Up one degree (↑)', fr: "Monter d'un degré (↑)" },
    't.seldown': { en: 'Down one degree (↓)', fr: "Descendre d'un degré (↓)" },
    't.selleft': { en: 'Shift left (←)', fr: 'Décaler à gauche (←)' },
    't.selright': { en: 'Shift right (→)', fr: 'Décaler à droite (→)' },
    't.seloctup': { en: 'Up one octave (Shift+↑)', fr: "Monter d'une octave (Maj+↑)" },
    't.seloctdown': { en: 'Down one octave (Shift+↓)', fr: "Descendre d'une octave (Maj+↓)" },
    't.x2': { en: 'Twice as long', fr: 'Deux fois plus long' },
    't.div2': { en: 'Twice as short', fr: 'Deux fois plus court' },
    't.harmoffset': { en: 'Harmonising interval', fr: "Intervalle d'harmonisation" },
    'sel.harm': { en: 'Harmonise', fr: 'Harmoniser' },
    't.selharm': { en: 'Add a parallel voice', fr: 'Ajouter une voix parallèle' },
    'sel.human': { en: 'Humanise', fr: 'Humaniser' },
    't.selhuman': { en: 'Vary the dynamics slightly', fr: 'Varier légèrement les nuances' },
    'sel.repeatlbl': { en: 'Repeat', fr: 'Répéter' },
    't.reptimes': { en: 'How many copies in a row', fr: 'Nombre de copies à la suite' },
    'sel.repeat': { en: 'Repeat', fr: 'Répéter' },
    't.selrepeat': { en: 'Copy the selection right after itself', fr: 'Recopier la sélection juste après elle-même' },
    'sel.fill': { en: 'Fill', fr: 'Remplir' },
    't.selfill': { en: 'Repeat to the end of the page', fr: "Répéter jusqu'au bout de la page" },
    'sel.loop': { en: 'Loop', fr: 'Boucler' },
    't.selloop': { en: 'Loop the selection', fr: 'Boucler la sélection' },
    'sel.loopoff': { en: 'Loop off', fr: 'Boucle off' },
    't.loopoff': { en: 'Remove the loop', fr: 'Supprimer la boucle' },

    /* ---------- note bar ---------- */
    'note.title': { en: 'Note', fr: 'Note' },
    'note.none': { en: 'none — click a note', fr: 'aucune — cliquez sur une note' },
    'note.length': { en: 'Length', fr: 'Longueur' },
    'note.steps': { en: 'steps', fr: 'pas' },
    't.notelen': { en: 'Exact length, in steps', fr: 'Longueur exacte, en pas' },
    'note.delete': { en: 'Delete', fr: 'Supprimer' },
    'note.at': { en: 'step {n}', fr: 'pas {n}' },

    /* ---------- tabs ---------- */
    'tab.grid': { en: 'Grid', fr: 'Grille' },
    'tab.sound': { en: 'Sound', fr: 'Son' },
    'tab.voice': { en: 'Voice', fr: 'Voix' },
    'tab.midi': { en: 'MIDI', fr: 'MIDI' },
    'tab.project': { en: 'Project', fr: 'Projet' },

    /* ---------- grid panel ---------- */
    'f.key': { en: 'Key', fr: 'Tonalité' },
    'f.scale': { en: 'Scale', fr: 'Gamme' },
    'f.preserve': { en: 'Keep the pitches', fr: 'Conserver les hauteurs' },
    't.preserve': { en: 'When the scale changes, move the drawing to the nearest notes', fr: 'Au changement de gamme, replacer le dessin sur les notes les plus proches' },
    'f.range': { en: 'Range', fr: 'Étendue' },
    'f.octave': { en: 'Octave', fr: 'Octave' },
    'f.tune': { en: 'Fine tuning', fr: 'Accord fin' },
    'f.cents': { en: 'cents', fr: 'cents' },
    'f.length': { en: 'Length', fr: 'Longueur' },
    'f.division': { en: 'Division', fr: 'Division' },
    'f.swing': { en: 'Swing', fr: 'Swing' },
    'f.chordbrush': { en: 'Brush', fr: 'Pinceau' },
    't.chordbrush': { en: 'Add parallel notes under the brush', fr: 'Ajouter des notes parallèles sous le pinceau' },
    'f.names': { en: 'Note names', fr: 'Noms de notes' },
    'f.notemark': { en: 'Mark on notes', fr: 'Repère sur les notes' },
    't.notemark': { en: 'Read the voices without relying on colour', fr: 'Lire les voix autrement que par la couleur' },
    'grid.info': { en: '{cols} steps · {rows} notes', fr: '{cols} pas · {rows} notes' },
    'swing.na': { en: 'not applicable in triplets', fr: 'sans objet en ternaire' },

    /* ---------- sound panel ---------- */
    'f.dynamics': { en: 'Dynamics', fr: 'Nuance' },
    'vel.gesture': { en: 'from the stylus, or the speed of the gesture', fr: 'au stylet, ou à la vitesse du geste' },
    'f.reverb': { en: 'Reverb', fr: 'Réverbération' },
    'f.echo': { en: 'Echo', fr: 'Écho' },
    'f.amount': { en: 'Amount', fr: 'Quantité' },
    't.delaytime': { en: 'Length, locked to the tempo', fr: 'Durée, calée sur le tempo' },
    't.delayfb': { en: 'Feedback', fr: 'Réinjection' },
    'f.metronome': { en: 'Metronome', fr: 'Métronome' },
    'btn.click': { en: 'Click', fr: 'Clic' },

    /* ---------- voice panel ---------- */
    'f.slot': { en: 'Selected slot', fr: 'Emplacement sélectionné' },
    'f.instrument': { en: 'Instrument', fr: 'Instrument' },
    't.instrument': { en: 'The sound this palette slot plays', fr: 'Le son joué par cet emplacement de la palette' },
    'f.volume': { en: 'Volume', fr: 'Volume' },
    'f.pan': { en: 'Pan', fr: 'Panoramique' },
    'f.envelope': { en: 'Envelope length', fr: "Longueur d'enveloppe" },
    'f.stroke': { en: 'A stroke gives…', fr: 'Un trait donne…' },
    'btn.held': { en: 'Held', fr: 'Tenue' },
    't.held': { en: 'One held note', fr: 'Une note tenue' },
    'btn.repeated': { en: 'Repeated', fr: 'Répétée' },
    't.repeated': { en: 'One attack per step', fr: 'Une attaque par pas' },
    'btn.vreset': { en: 'Reset this voice', fr: 'Réinitialiser cette voix' },

    /* ---------- MIDI panel ---------- */
    'f.access': { en: 'Access', fr: 'Accès' },
    'btn.enable': { en: 'Enable', fr: 'Activer' },
    'btn.midion': { en: 'MIDI on', fr: 'MIDI actif' },
    'f.midiin': { en: 'Input keyboard', fr: 'Clavier entrant' },
    'f.midiout': { en: 'Output synth', fr: 'Synthé sortant' },
    'f.dest': { en: 'Where the sound goes', fr: 'Destination du son' },
    'btn.midisend': { en: 'MIDI out', fr: 'Sortie MIDI' },
    't.midisend': { en: 'Send the notes to the external synth', fr: 'Envoyer les notes au synthé externe' },
    'btn.midilocal': { en: 'Internal engine', fr: 'Moteur interne' },
    't.midilocal': { en: 'Also play through the built-in engine', fr: 'Jouer aussi avec le moteur interne' },
    'midi.https': { en: 'Web MIDI needs http://localhost: run <b>serve.cmd</b> if the button stays greyed out.', fr: 'Web MIDI exige http://localhost : lancez <b>serve.cmd</b> si le bouton reste inactif.' },
    'midi.devices': { en: '{in} in, {out} out', fr: '{in} entrée·s, {out} sortie·s' },
    'midi.needlocal': { en: 'http://localhost required', fr: 'http://localhost requis' },
    'midi.unsupported': { en: 'This browser does not offer Web MIDI.', fr: 'Ce navigateur ne propose pas Web MIDI.' },
    'midi.insecure': { en: 'Web MIDI needs http://localhost: run serve.cmd.', fr: 'Web MIDI exige http://localhost : lancez serve.cmd.' },
    'midi.denied': { en: 'MIDI access refused: {msg}', fr: 'Accès MIDI refusé : {msg}' },
    'opt.none2': { en: '(none)', fr: '(aucun)' },

    /* ---------- project panel ---------- */
    'f.projects': { en: 'Saved projects', fr: 'Projets enregistrés' },
    'btn.open': { en: 'Open', fr: 'Ouvrir' },
    'btn.save': { en: 'Save', fr: 'Enregistrer' },
    'btn.delete': { en: 'Delete', fr: 'Supprimer' },
    'f.file': { en: 'File', fr: 'Fichier' },
    'btn.export': { en: 'Export', fr: 'Exporter' },
    't.export': { en: 'Download a .json file', fr: 'Télécharger un .json' },
    'btn.import': { en: 'Import', fr: 'Importer' },
    't.import': { en: 'Load a .json file', fr: 'Charger un .json' },
    'f.restore': { en: 'Restore points', fr: 'Points de restauration' },
    'restore.hint': { en: 'Taken automatically before anything that undo cannot put back.', fr: "Pris automatiquement avant toute opération qu'une annulation ne rattrape pas." },
    'btn.restoreapply': { en: 'Go back to this point', fr: 'Revenir à ce point' },
    'btn.restoreclear': { en: 'Clear', fr: 'Vider' },
    'f.about': { en: 'About', fr: 'À propos' },
    'about.1': { en: 'Everything happens in your browser: <b>no account, no cookie, nothing sent anywhere</b>. Your drawings and settings stay on your device, in local storage, and disappear if you clear this site\'s data.', fr: "Tout se passe dans votre navigateur : <b>aucun compte, aucun cookie, aucune donnée envoyée</b>. Vos dessins et réglages restent sur votre appareil, dans le stockage local, et s'effacent si vous videz les données de ce site." },
    'about.2': { en: 'The sound is synthesised on the fly — there is not a single sample in the application.', fr: "Le son est synthétisé à la volée — il n'y a aucun échantillon dans l'application." },
    'about.3': { en: 'Original code, artwork and music. No third-party library.', fr: 'Code, graphisme et musiques originaux. Aucune bibliothèque tierce.' },
    'f.exportsound': { en: 'Export the sound', fr: 'Exporter le son' },
    'btn.stems': { en: 'Stems', fr: 'Pistes' },
    't.stems': { en: 'One WAV file per voice used', fr: 'Un WAV par voix utilisée' },

    /* ---------- status bar ---------- */
    'keys.line': {
      en: '<kbd>Space</kbd> play · <kbd>B</kbd> <kbd>E</kbd> tools · <kbd>1</kbd>–<kbd>9</kbd> colours · <kbd>[</kbd> <kbd>]</kbd> pages · <kbd>S</kbd> selection <span class="dim">(harmonise, repeat…)</span> · <kbd>N</kbd> note <span class="dim">(stretch, move)</span> · <kbd>Ctrl</kbd>+wheel zoom · <kbd>Alt</kbd> erase',
      fr: '<kbd>Espace</kbd> lecture · <kbd>B</kbd> <kbd>E</kbd> outils · <kbd>1</kbd>–<kbd>9</kbd> couleurs · <kbd>[</kbd> <kbd>]</kbd> pages · <kbd>S</kbd> sélection <span class="dim">(harmoniser, répéter…)</span> · <kbd>N</kbd> note <span class="dim">(étirer, déplacer)</span> · <kbd>Ctrl</kbd>+molette zoom · <kbd>Alt</kbd> gomme'
    },
    'restore.chip': { en: 'Restore point:', fr: 'Point de restauration :' },
    'btn.goback': { en: 'Go back', fr: 'Revenir' },
    'btn.close': { en: 'Close', fr: 'Fermer' },
    'oof.suffix': { en: 'out of frame', fr: 'hors cadre' },
    'oof.count': { en: '{n} note', fr: '{n} note' },
    'oof.countp': { en: '{n} notes', fr: '{n} notes' },
    'btn.grow': { en: 'Enlarge', fr: 'Agrandir' },
    'btn.prune': { en: 'Delete', fr: 'Supprimer' },

    /* ---------- dropdown options ---------- */
    'opt.none': { en: 'None', fr: 'Aucun' },
    'opt.bar1': { en: '1 bar', fr: '1 mesure' },
    'opt.bar2': { en: '2 bars', fr: '2 mesures' },
    'opt.octave': { en: '{n} octave', fr: '{n} octave' },
    'opt.octaves': { en: '{n} octaves', fr: '{n} octaves' },
    'opt.bar': { en: '{n} bar', fr: '{n} mesure' },
    'opt.bars': { en: '{n} bars', fr: '{n} mesures' },
    'div.1/4': { en: 'Quarter', fr: 'Noire' },
    'div.1/8': { en: 'Eighth', fr: 'Croche' },
    'div.1/8t': { en: 'Eighth triplet', fr: 'Triolet de croches' },
    'div.1/16': { en: 'Sixteenth', fr: 'Double croche' },
    'div.1/16t': { en: 'Sixteenth triplet', fr: 'Triolet de doubles' },
    'div.3/16': { en: 'Dotted eighth', fr: 'Croche pointée' },
    'div.triplet': { en: 'Triplet', fr: 'Triolet' },
    'swing.0': { en: 'None', fr: 'Aucun' },
    'swing.light': { en: 'Light', fr: 'Léger' },
    'swing.medium': { en: 'Medium', fr: 'Moyen' },
    'swing.strong': { en: 'Strong', fr: 'Marqué' },
    'vel.dynamic': { en: 'From the gesture', fr: 'Au geste' },
    'vel.fixed': { en: 'Fixed', fr: 'Fixe' },
    'brush.none': { en: 'Single', fr: 'Simple' },
    'brush.third': { en: 'Third', fr: 'Tierce' },
    'brush.triad': { en: 'Triad', fr: 'Triade' },
    'brush.fifth': { en: 'Fifth', fr: 'Quinte' },
    'brush.octave': { en: 'Octave', fr: 'Octave' },
    'harm.2': { en: 'Third above', fr: 'Tierce dessus' },
    'harm.-2': { en: 'Third below', fr: 'Tierce dessous' },
    'harm.4': { en: 'Fifth above', fr: 'Quinte dessus' },
    'harm.-4': { en: 'Fifth below', fr: 'Quinte dessous' },
    'harm.oct': { en: 'Octave above', fr: 'Octave dessus' },
    'harm.-oct': { en: 'Octave below', fr: 'Octave dessous' },
    'mark.none': { en: 'None', fr: 'Aucun' },
    'mark.number': { en: 'Voice number', fr: 'Numéro de voix' },
    'mark.initial': { en: 'Instrument initial', fr: "Initiale de l'instrument" },

    /* ---------- scales ---------- */
    'scale.majorPenta': { en: 'Major pentatonic', fr: 'Pentatonique majeure' },
    'scale.minorPenta': { en: 'Minor pentatonic', fr: 'Pentatonique mineure' },
    'scale.major': { en: 'Major', fr: 'Majeure' },
    'scale.minor': { en: 'Natural minor', fr: 'Mineure naturelle' },
    'scale.harmonicMinor': { en: 'Harmonic minor', fr: 'Mineure harmonique' },
    'scale.dorian': { en: 'Dorian', fr: 'Dorien' },
    'scale.phrygian': { en: 'Phrygian', fr: 'Phrygien' },
    'scale.lydian': { en: 'Lydian', fr: 'Lydien' },
    'scale.mixolydian': { en: 'Mixolydian', fr: 'Mixolydien' },
    'scale.blues': { en: 'Blues', fr: 'Blues' },
    'scale.wholeTone': { en: 'Whole tone', fr: 'Par tons' },
    'scale.chromatic': { en: 'Chromatic', fr: 'Chromatique' },

    /* ---------- instrument families ---------- */
    'family.tuned': { en: 'Tuned percussion', fr: 'Percussions mélodiques' },
    'family.plucked': { en: 'Plucked and keys', fr: 'Pincés et claviers' },
    'family.wind': { en: 'Winds and strings', fr: 'Souffle et cordes' },
    'family.bass': { en: 'Bass and leads', fr: 'Basses et leads' },
    'family.drums': { en: 'Drums', fr: 'Percussions' },

    /* ---------- instruments ---------- */
    'inst.marimba': { en: 'Marimba', fr: 'Marimba' },
    'inst.vibra': { en: 'Vibraphone', fr: 'Vibraphone' },
    'inst.kalimba': { en: 'Kalimba', fr: 'Kalimba' },
    'inst.musicbox': { en: 'Music box', fr: 'Boîte à musique' },
    'inst.bell': { en: 'Bell', fr: 'Cloche' },
    'inst.glass': { en: 'Glass', fr: 'Verre' },
    'inst.pluck': { en: 'Pluck', fr: 'Pincé' },
    'inst.harp': { en: 'Harp', fr: 'Harpe' },
    'inst.piano': { en: 'Soft piano', fr: 'Piano doux' },
    'inst.organ': { en: 'Organ', fr: 'Orgue' },
    'inst.flute': { en: 'Flute', fr: 'Flûte' },
    'inst.strings': { en: 'Strings', fr: 'Cordes' },
    'inst.brass': { en: 'Brass', fr: 'Cuivre' },
    'inst.choir': { en: 'Choir', fr: 'Chœur' },
    'inst.pad': { en: 'Pad', fr: 'Nappe' },
    'inst.bass': { en: 'Bass', fr: 'Basse' },
    'inst.sub': { en: 'Sub bass', fr: 'Basse sub' },
    'inst.acid': { en: 'Acid bass', fr: 'Basse acide' },
    'inst.lead': { en: 'Lead', fr: 'Lead' },
    'inst.square': { en: 'Square lead', fr: 'Lead carré' },
    'inst.perc': { en: 'Woodblock', fr: 'Bois' },
    'inst.kick': { en: 'Kick', fr: 'Grosse caisse' },
    'inst.snare': { en: 'Snare', fr: 'Caisse claire' },
    'inst.hat': { en: 'Hi-hat', fr: 'Charleston' },
    'inst.clave': { en: 'Clave', fr: 'Clave' },

    /* ---------- messages ---------- */
    'msg.clearpage': { en: 'Erase the whole of page {n}?', fr: 'Effacer toute la page {n} ?' },
    'msg.nofreepage': { en: 'No free page: empty one first.', fr: "Aucune page libre : videz-en une d'abord." },
    'msg.growpartial': { en: 'Enlarged as far as possible, but some notes are still out of frame.', fr: 'Agrandi au maximum, mais certaines notes restent hors cadre.' },
    'msg.prune': { en: 'Permanently delete the notes that are out of frame?', fr: 'Supprimer définitivement les notes hors cadre ?' },
    'msg.projname': { en: 'Project name:', fr: 'Nom du projet :' },
    'msg.projreplace': { en: 'Replace “{name}”?', fr: 'Remplacer « {name} » ?' },
    'msg.projsavefail': { en: 'Could not save (storage unavailable).', fr: 'Enregistrement impossible (stockage indisponible).' },
    'msg.projopen': { en: 'Open “{name}”? The current work will be replaced.', fr: 'Ouvrir « {name} » ? Le travail en cours sera remplacé.' },
    'msg.projdelete': { en: 'Delete “{name}”?', fr: 'Supprimer « {name} » ?' },
    'msg.importfail': { en: 'Unreadable file: {msg}', fr: 'Fichier illisible : {msg}' },
    'msg.imported': { en: 'Project “{name}” loaded.', fr: 'Projet « {name} » chargé.' },
    'msg.restoreconfirm': { en: 'Go back to this point? The current work will be replaced.', fr: 'Revenir à ce point ? Le travail en cours sera remplacé.' },
    'msg.restoreclear': { en: 'Clear every restore point?', fr: 'Vider tous les points de restauration ?' },
    'msg.exportfail': { en: 'Export failed: {msg}', fr: 'Export impossible : {msg}' },
    'msg.stemsdone': { en: '{n} stem file(s) exported.', fr: '{n} piste(s) exportée(s).' },
    'msg.rendering': { en: 'Rendering…', fr: 'Rendu…' },
    'msg.offline': { en: 'Offline rendering is not available in this browser.', fr: 'Rendu hors-ligne indisponible dans ce navigateur.' },
    'msg.emptyexport': { en: 'Nothing to export: the page is empty.', fr: 'Rien à exporter : la page est vide.' },
    'msg.badfile': { en: 'file not recognised', fr: 'fichier non reconnu' },

    /* ---------- restore points ---------- */
    'r.before.clear': { en: 'Before clearing page {n}', fr: 'Avant vidage de la page {n}' },
    'r.before.scale': { en: 'Before the scale change', fr: 'Avant changement de gamme' },
    'r.before.range': { en: 'Before the range change', fr: "Avant changement d'étendue" },
    'r.before.length': { en: 'Before the length change', fr: 'Avant changement de longueur' },
    'r.before.division': { en: 'Before the division change', fr: 'Avant changement de division' },
    'r.before.grow': { en: 'Before enlarging', fr: 'Avant agrandissement' },
    'r.before.prune': { en: 'Before deleting out-of-frame notes', fr: 'Avant suppression hors cadre' },
    'r.before.open': { en: 'Before opening {name}', fr: 'Avant ouverture de {name}' },
    'r.before.import': { en: 'Before importing a file', fr: 'Avant import de fichier' },
    'r.before.record': { en: 'Before recording', fr: 'Avant enregistrement' },
    'r.before.restore': { en: 'Before restoring', fr: 'Avant restauration' },
    'r.deleted': { en: 'Deleted project: {name}', fr: 'Projet supprimé : {name}' },
    'r.now': { en: 'just now', fr: "à l'instant" },
    'r.min': { en: '{n} min ago', fr: 'il y a {n} min' },
    'r.hour': { en: '{n} h ago', fr: 'il y a {n} h' },

    /* ---------- misc ---------- */
    'page.n': { en: 'Page {n}', fr: 'Page {n}' },
    'page.empty': { en: 'Page {n} (empty)', fr: 'Page {n} (vide)' },
    'song.link': { en: 'Link {i}: page {p} (click to change)', fr: 'Maillon {i} : page {p} (clic pour changer)' }
  };

  let lang = 'en';

  function setLang(l) { lang = (l === 'fr') ? 'fr' : 'en'; }
  function getLang() { return lang; }

  /* First run only: a French browser opens on French. Once the language has
     been chosen it is saved with the rest of the state, and this is ignored. */
  function detect() {
    try {
      const want = navigator.languages || [navigator.language || ''];
      for (let i = 0; i < want.length; i++) {
        if (String(want[i]).toLowerCase().indexOf('fr') === 0) return 'fr';
      }
    } catch (e) { /* no navigator: English */ }
    return 'en';
  }

  /* t('grid.info', { cols: 32, rows: 16 }) */
  function t(key, vars) {
    const entry = DICT[key];
    let s = entry ? (entry[lang] || entry.en) : key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(vars[k]);
      });
    }
    return s;
  }
  /* plural helper for the one or two places that need it */
  function plural(n, one, many) { return t(n > 1 ? many : one, { n: n }); }

  /* Fills every element carrying a key. Called once at start-up and on each
     language change — nothing is reloaded. */
  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = lang;
  }

  return {
    t: t, plural: plural, setLang: setLang, getLang: getLang,
    detect: detect, apply: apply, DICT: DICT
  };
})();
