/**
 * Password Generator Page
 * Generatore password configurabile con crypto.getRandomValues()
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, RefreshCw, Shield } from 'lucide-react';
import { cryptoService } from '../services/cryptoService';

// Set di caratteri
const CHAR_SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!@#$%^&*?_~-+=/\\|{}[]()<>:;,.',
};

// Parole per passphrase (lista concisa ma sufficiente)
const WORD_LIST = [
    'able', 'acid', 'aged', 'also', 'army', 'away', 'baby', 'back', 'ball', 'band',
    'bank', 'base', 'bath', 'bear', 'beat', 'been', 'bell', 'best', 'bird', 'blow',
    'blue', 'boat', 'body', 'bomb', 'bond', 'bone', 'book', 'boot', 'born', 'boss',
    'bowl', 'burn', 'bush', 'busy', 'cafe', 'cage', 'cake', 'call', 'calm', 'came',
    'camp', 'card', 'care', 'case', 'cash', 'cast', 'cave', 'chef', 'chin', 'chip',
    'city', 'clay', 'clip', 'club', 'clue', 'coal', 'coat', 'code', 'coin', 'cold',
    'come', 'cook', 'cool', 'cope', 'copy', 'core', 'cost', 'crew', 'crop', 'cube',
    'cure', 'cute', 'dark', 'data', 'date', 'dawn', 'dead', 'deal', 'dear', 'debt',
    'deep', 'deer', 'demo', 'deny', 'desk', 'dial', 'diet', 'dirt', 'dish', 'disk',
    'dock', 'does', 'done', 'door', 'dose', 'down', 'draw', 'drew', 'drop', 'drug',
    'drum', 'dual', 'duke', 'dump', 'dust', 'duty', 'each', 'earn', 'ease', 'east',
    'easy', 'edge', 'else', 'epic', 'euro', 'even', 'ever', 'evil', 'exam', 'exit',
    'face', 'fact', 'fade', 'fail', 'fair', 'fall', 'fame', 'farm', 'fast', 'fate',
    'fear', 'feed', 'feel', 'feet', 'fell', 'felt', 'file', 'fill', 'film', 'find',
    'fine', 'fire', 'firm', 'fish', 'five', 'flag', 'flat', 'fled', 'flew', 'flip',
    'flow', 'foam', 'fold', 'folk', 'font', 'food', 'foot', 'ford', 'fore', 'fork',
    'form', 'fort', 'foul', 'four', 'free', 'from', 'fuel', 'full', 'fund', 'fury',
    'fuse', 'gain', 'game', 'gang', 'gate', 'gave', 'gear', 'gene', 'gift', 'girl',
    'give', 'glad', 'glow', 'glue', 'goat', 'goes', 'gold', 'golf', 'gone', 'good',
    'grab', 'gray', 'grew', 'grid', 'grip', 'grow', 'gulf', 'guru', 'hack', 'half',
    'hall', 'halt', 'hand', 'hang', 'hard', 'harm', 'hate', 'have', 'haze', 'head',
    'heal', 'heap', 'hear', 'heat', 'held', 'help', 'herb', 'here', 'hero', 'hide',
    'high', 'hike', 'hill', 'hint', 'hire', 'hold', 'hole', 'holy', 'home', 'hook',
    'hope', 'horn', 'host', 'hour', 'huge', 'hung', 'hunt', 'hurt', 'hymn', 'icon',
    'idea', 'inch', 'info', 'into', 'iron', 'isle', 'item', 'jack', 'jade', 'jail',
    'jane', 'jazz', 'jean', 'joke', 'jump', 'jury', 'just', 'keen', 'keep', 'kelp',
    'kept', 'kick', 'kids', 'kill', 'kind', 'king', 'knee', 'knew', 'knit', 'knob',
    'knot', 'know', 'lack', 'lady', 'laid', 'lake', 'lamp', 'land', 'lane', 'last',
    'late', 'lawn', 'lazy', 'lead', 'leaf', 'lean', 'left', 'lend', 'lens', 'less',
    'life', 'lift', 'like', 'lime', 'limp', 'line', 'link', 'lion', 'list', 'live',
    'load', 'loan', 'lock', 'logo', 'long', 'look', 'lord', 'lose', 'loss', 'lost',
    'love', 'luck', 'lump', 'lung', 'made', 'mail', 'main', 'make', 'male', 'mall',
    'many', 'mark', 'mask', 'mass', 'mate', 'maze', 'meal', 'mean', 'meat', 'meet',
    'melt', 'memo', 'menu', 'mere', 'mesh', 'mess', 'mild', 'milk', 'mill', 'mind',
    'mine', 'mint', 'miss', 'mode', 'mood', 'moon', 'more', 'most', 'moth', 'move',
    'much', 'must', 'myth', 'nail', 'name', 'navy', 'near', 'neat', 'neck', 'need',
    'nest', 'news', 'next', 'nice', 'nine', 'node', 'none', 'norm', 'nose', 'note',
    'noun', 'odds', 'okay', 'omit', 'once', 'only', 'onto', 'open', 'oral', 'over',
    'pace', 'pack', 'page', 'paid', 'pain', 'pair', 'pale', 'palm', 'pane', 'park',
    'part', 'pass', 'past', 'path', 'peak', 'peer', 'pick', 'pier', 'pile', 'pine',
    'pink', 'pipe', 'plan', 'play', 'plot', 'plug', 'plus', 'poem', 'poet', 'pole',
    'poll', 'pond', 'pool', 'poor', 'pope', 'pork', 'port', 'pose', 'post', 'pour',
    'pray', 'prey', 'pull', 'pump', 'pure', 'push', 'quit', 'quiz', 'race', 'rack',
    'rage', 'raid', 'rail', 'rain', 'rank', 'rare', 'rate', 'read', 'real', 'rear',
    'reed', 'reef', 'rely', 'rent', 'rest', 'rice', 'rich', 'ride', 'ring', 'rise',
    'risk', 'road', 'rock', 'rode', 'role', 'roll', 'roof', 'room', 'root', 'rope',
    'rose', 'ruin', 'rule', 'rush', 'rust', 'safe', 'sage', 'said', 'sail', 'sake',
    'sale', 'salt', 'same', 'sand', 'sang', 'save', 'seal', 'seat', 'seed', 'seek',
    'seem', 'seen', 'self', 'sell', 'send', 'sent', 'sept', 'shed', 'ship', 'shop',
    'shot', 'show', 'shut', 'sick', 'side', 'sign', 'silk', 'sing', 'sink', 'site',
    'size', 'skip', 'slim', 'slip', 'slot', 'slow', 'snap', 'snow', 'soap', 'soar',
    'sock', 'soft', 'soil', 'sold', 'sole', 'some', 'song', 'soon', 'sort', 'soul',
    'spin', 'spot', 'star', 'stay', 'stem', 'step', 'stir', 'stop', 'such', 'suit',
    'sure', 'swim', 'tail', 'take', 'tale', 'talk', 'tall', 'tank', 'tape', 'task',
    'taxi', 'team', 'tear', 'tell', 'temp', 'tend', 'tent', 'term', 'test', 'text',
    'than', 'that', 'them', 'then', 'they', 'thin', 'this', 'thus', 'tide', 'tidy',
    'tied', 'tier', 'tile', 'till', 'time', 'tiny', 'tire', 'toad', 'told', 'toll',
    'tone', 'took', 'tool', 'tops', 'tore', 'torn', 'tour', 'town', 'trap', 'tray',
    'tree', 'trim', 'trio', 'trip', 'true', 'tube', 'tuck', 'tune', 'turn', 'twin',
    'type', 'ugly', 'undo', 'unit', 'upon', 'urge', 'used', 'user', 'vain', 'vale',
    'vary', 'vast', 'verb', 'very', 'vice', 'view', 'vine', 'visa', 'void', 'volt',
    'vote', 'wade', 'wage', 'wait', 'wake', 'walk', 'wall', 'want', 'ward', 'warm',
    'warn', 'wash', 'vast', 'wave', 'weak', 'wear', 'weed', 'week', 'well', 'went',
    'were', 'west', 'what', 'when', 'whom', 'wide', 'wife', 'wild', 'will', 'wind',
    'wine', 'wing', 'wire', 'wise', 'wish', 'with', 'woke', 'wolf', 'wood', 'wool',
    'word', 'wore', 'work', 'worm', 'worn', 'wrap', 'yard', 'yarn', 'year', 'yell',
    'yoga', 'your', 'zero', 'zone', 'zoom'
];

/**
 * Genera una password casuale con crypto.getRandomValues()
 */
function generatePassword(options) {
    const { length, useLower, useUpper, useDigits, useSymbols } = options;

    // Costruisci il set di caratteri in base alle opzioni
    let charPool = '';
    const enabledSets = [];
    if (useLower) { charPool += CHAR_SETS.lower; enabledSets.push(CHAR_SETS.lower); }
    if (useUpper) { charPool += CHAR_SETS.upper; enabledSets.push(CHAR_SETS.upper); }
    if (useDigits) { charPool += CHAR_SETS.digits; enabledSets.push(CHAR_SETS.digits); }
    if (useSymbols) { charPool += CHAR_SETS.symbols; enabledSets.push(CHAR_SETS.symbols); }

    if (charPool.length === 0 || length < 1) {
        return '';
    }

    // Genera caratteri random
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    const chars = Array.from(randomValues, (val) => charPool[val % charPool.length]);

    // Garantisci almeno 1 carattere da ogni set abilitato (se length lo permette)
    if (enabledSets.length <= length) {
        const guaranteeValues = new Uint32Array(enabledSets.length);
        crypto.getRandomValues(guaranteeValues);
        enabledSets.forEach((set, i) => {
            chars[i] = set[guaranteeValues[i] % set.length];
        });
    }

    // Shuffle Fisher-Yates con crypto-random
    const shuffleValues = new Uint32Array(chars.length);
    crypto.getRandomValues(shuffleValues);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = shuffleValues[i] % (i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
}

/**
 * Genera una passphrase
 */
function generatePassphrase(options) {
    const { wordCount, separator, capitalize } = options;

    const randomValues = new Uint32Array(wordCount);
    crypto.getRandomValues(randomValues);

    const words = Array.from(randomValues, (val) => {
        const word = WORD_LIST[val % WORD_LIST.length];
        return capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    });

    return words.join(separator);
}

/**
 * Calcola entropia in bit
 */
function calculateEntropy(password, mode, options) {
    if (!password) return 0;

    if (mode === 'passphrase') {
        // Entropia passphrase: log2(poolSize) * wordCount
        return Math.floor(Math.log2(WORD_LIST.length) * options.wordCount);
    }

    // Entropia password: log2(charPoolSize) * length
    let poolSize = 0;
    if (options.useLower) poolSize += CHAR_SETS.lower.length;
    if (options.useUpper) poolSize += CHAR_SETS.upper.length;
    if (options.useDigits) poolSize += CHAR_SETS.digits.length;
    if (options.useSymbols) poolSize += CHAR_SETS.symbols.length;

    if (poolSize === 0) return 0;
    return Math.floor(Math.log2(poolSize) * password.length);
}

/**
 * Valuta la forza in base all'entropia
 */
function getStrengthFromEntropy(bits) {
    if (bits === 0) return { label: '', color: 'bg-gray-300', textColor: 'text-gray-400', percent: 0 };
    if (bits < 30) return { label: 'Very Weak', color: 'bg-red-500', textColor: 'text-red-500', percent: 10 };
    if (bits < 50) return { label: 'Weak', color: 'bg-orange-500', textColor: 'text-orange-500', percent: 25 };
    if (bits < 70) return { label: 'Fair', color: 'bg-yellow-500', textColor: 'text-yellow-600', percent: 45 };
    if (bits < 90) return { label: 'Strong', color: 'bg-blue-500', textColor: 'text-blue-500', percent: 65 };
    if (bits < 120) return { label: 'Very Strong', color: 'bg-green-500', textColor: 'text-green-500', percent: 85 };
    return { label: 'Excellent', color: 'bg-green-600', textColor: 'text-green-600', percent: 100 };
}


export function PasswordGeneratorPage() {
    const navigate = useNavigate();

    // Modalità: 'password' o 'passphrase'
    const [mode, setMode] = useState('password');

    // Opzioni password
    const [passwordOptions, setPasswordOptions] = useState({
        length: 20,
        useLower: true,
        useUpper: true,
        useDigits: true,
        useSymbols: true,
    });

    // Opzioni passphrase
    const [passphraseOptions, setPassphraseOptions] = useState({
        wordCount: 5,
        separator: '-',
        capitalize: true,
    });

    const [generatedPassword, setGeneratedPassword] = useState('');
    const [copied, setCopied] = useState(false);
    const [history, setHistory] = useState([]);

    // Genera password/passphrase
    const handleGenerate = useCallback(() => {
        let result;
        if (mode === 'password') {
            result = generatePassword(passwordOptions);
        } else {
            result = generatePassphrase(passphraseOptions);
        }
        setGeneratedPassword(result);
        setCopied(false);

        // Aggiungi alla history (max 10)
        if (result) {
            setHistory(prev => [
                { value: result, mode, timestamp: Date.now() },
                ...prev.slice(0, 9)
            ]);
        }
    }, [mode, passwordOptions, passphraseOptions]);

    // Copia in clipboard
    async function handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text || generatedPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);

            // Auto-clear clipboard dopo 30s
            const copiedText = text || generatedPassword;
            setTimeout(async () => {
                try {
                    const current = await navigator.clipboard.readText();
                    if (current === copiedText) {
                        await navigator.clipboard.writeText('');
                    }
                } catch (_) { /* ignore */ }
            }, 30000);
        } catch (_) { /* ignore */ }
    }

    // Calcola entropia e forza
    const currentOptions = mode === 'password' ? passwordOptions : passphraseOptions;
    const entropy = calculateEntropy(generatedPassword, mode, currentOptions);
    const strength = getStrengthFromEntropy(entropy);

    // Almeno un set deve essere attivo
    const atLeastOneSet = passwordOptions.useLower || passwordOptions.useUpper
        || passwordOptions.useDigits || passwordOptions.useSymbols;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-primary text-white px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-primary-dark rounded-lg transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-xl font-bold">Password Generator</h1>
            </div>

            <div className="p-4 space-y-4 max-w-2xl mx-auto pb-20">

                {/* Output */}
                <div className="bg-white rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <div
                            className="flex-1 font-mono text-sm bg-gray-50 px-3 py-3 rounded border border-gray-200 break-all min-h-[48px] flex items-center"
                        >
                            {generatedPassword || (
                                <span className="text-gray-400">
                                    Press "Generate" to create a password
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => handleCopy()}
                            disabled={!generatedPassword}
                            className="p-3 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-30"
                        >
                            {copied ? <Check size={22} /> : <Copy size={22} />}
                        </button>
                    </div>

                    {/* Strength bar */}
                    {generatedPassword && (
                        <div className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className={`font-semibold ${strength.textColor}`}>
                                    {strength.label}
                                </span>
                                <span className="text-gray-500">
                                    {entropy} bit entropy
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full transition-all duration-300 ${strength.color}`}
                                    style={{ width: `${strength.percent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={mode === 'password' && !atLeastOneSet}
                        className="w-full bg-primary hover:bg-primary-dark text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={20} />
                        Generate
                    </button>
                </div>

                {/* Mode selector */}
                <div className="bg-white rounded-lg overflow-hidden flex border border-gray-200">
                    <button
                        onClick={() => { setMode('password'); setGeneratedPassword(''); }}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'password'
                            ? 'bg-primary text-white'
                            : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        Password
                    </button>
                    <button
                        onClick={() => { setMode('passphrase'); setGeneratedPassword(''); }}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'passphrase'
                            ? 'bg-primary text-white'
                            : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        Passphrase
                    </button>
                </div>

                {/* Password options */}
                {mode === 'password' && (
                    <div className="bg-white rounded-lg p-4 space-y-4">
                        {/* Length slider */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-gray-700">Length</label>
                                <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                    {passwordOptions.length}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="4"
                                max="64"
                                value={passwordOptions.length}
                                onChange={(e) => setPasswordOptions(prev => ({
                                    ...prev,
                                    length: Number(e.target.value)
                                }))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>4</span>
                                <span>64</span>
                            </div>
                        </div>

                        {/* Character toggles */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Characters</label>

                            <ToggleOption
                                label="Lowercase"
                                example="a-z"
                                checked={passwordOptions.useLower}
                                onChange={(v) => setPasswordOptions(prev => ({ ...prev, useLower: v }))}
                                disabled={!passwordOptions.useUpper && !passwordOptions.useDigits && !passwordOptions.useSymbols && passwordOptions.useLower}
                            />
                            <ToggleOption
                                label="Uppercase"
                                example="A-Z"
                                checked={passwordOptions.useUpper}
                                onChange={(v) => setPasswordOptions(prev => ({ ...prev, useUpper: v }))}
                                disabled={!passwordOptions.useLower && !passwordOptions.useDigits && !passwordOptions.useSymbols && passwordOptions.useUpper}
                            />
                            <ToggleOption
                                label="Numbers"
                                example="0-9"
                                checked={passwordOptions.useDigits}
                                onChange={(v) => setPasswordOptions(prev => ({ ...prev, useDigits: v }))}
                                disabled={!passwordOptions.useLower && !passwordOptions.useUpper && !passwordOptions.useSymbols && passwordOptions.useDigits}
                            />
                            <ToggleOption
                                label="Symbols"
                                example="!@#$%..."
                                checked={passwordOptions.useSymbols}
                                onChange={(v) => setPasswordOptions(prev => ({ ...prev, useSymbols: v }))}
                                disabled={!passwordOptions.useLower && !passwordOptions.useUpper && !passwordOptions.useDigits && passwordOptions.useSymbols}
                            />
                        </div>
                    </div>
                )}

                {/* Passphrase options */}
                {mode === 'passphrase' && (
                    <div className="bg-white rounded-lg p-4 space-y-4">
                        {/* Word count slider */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium text-gray-700">Words</label>
                                <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                    {passphraseOptions.wordCount}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="3"
                                max="10"
                                value={passphraseOptions.wordCount}
                                onChange={(e) => setPassphraseOptions(prev => ({
                                    ...prev,
                                    wordCount: Number(e.target.value)
                                }))}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>3</span>
                                <span>10</span>
                            </div>
                        </div>

                        {/* Separator */}
                        <div>
                            <label className="text-sm font-medium text-gray-700 block mb-2">Separator</label>
                            <div className="flex gap-2">
                                {['-', '.', '_', ' ', '#'].map((sep) => (
                                    <button
                                        key={sep}
                                        onClick={() => setPassphraseOptions(prev => ({ ...prev, separator: sep }))}
                                        className={`flex-1 py-2 rounded-lg border text-sm font-mono transition-colors ${passphraseOptions.separator === sep
                                            ? 'border-primary bg-primary/10 text-primary font-bold'
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        {sep === ' ' ? '⎵' : sep}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Capitalize toggle */}
                        <ToggleOption
                            label="Capitalize words"
                            example="Word vs word"
                            checked={passphraseOptions.capitalize}
                            onChange={(v) => setPassphraseOptions(prev => ({ ...prev, capitalize: v }))}
                        />
                    </div>
                )}

                {/* Info box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <Shield size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                        {mode === 'password' ? (
                            <p>
                                Passwords are generated using the browser's cryptographic random number generator
                                (<code className="text-xs bg-blue-100 px-1 rounded">crypto.getRandomValues</code>).
                                For maximum security, use at least 16 characters with all character types enabled.
                            </p>
                        ) : (
                            <p>
                                Passphrases are easier to remember and type. Each word adds ~{Math.floor(Math.log2(WORD_LIST.length))} bits
                                of entropy. Use at least 5 words for strong security.
                            </p>
                        )}
                    </div>
                </div>

                {/* History */}
                {history.length > 0 && (
                    <div className="bg-white rounded-lg overflow-hidden">
                        <div className="p-4 border-b bg-gray-50">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-gray-700">
                                    Recent ({history.length})
                                </h2>
                                <button
                                    onClick={() => setHistory([])}
                                    className="text-xs text-red-500 hover:text-red-600"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {history.map((item, i) => (
                                <div key={item.timestamp} className="px-4 py-3 flex items-center gap-2">
                                    <div className="flex-1 font-mono text-xs text-gray-600 truncate">
                                        {item.value}
                                    </div>
                                    <span className="text-[10px] text-gray-400 uppercase flex-shrink-0">
                                        {item.mode === 'passphrase' ? 'phrase' : 'pwd'}
                                    </span>
                                    <button
                                        onClick={() => handleCopy(item.value)}
                                        className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors flex-shrink-0"
                                    >
                                        <Copy size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


/**
 * Toggle switch component
 */
function ToggleOption({ label, example, checked, onChange, disabled = false }) {
    return (
        <label className={`flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors cursor-pointer ${checked ? 'border-primary/30 bg-primary/5' : 'border-gray-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex items-center gap-3">
                <span className="text-sm text-gray-800">{label}</span>
                {example && (
                    <span className="text-xs text-gray-400 font-mono">{example}</span>
                )}
            </div>
            <div
                className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-gray-300'}`}
                onClick={(e) => {
                    if (disabled) { e.preventDefault(); return; }
                }}
            >
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                        if (!disabled) onChange(e.target.checked);
                    }}
                    className="sr-only"
                />
                <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'
                        }`}
                />
            </div>
        </label>
    );
}