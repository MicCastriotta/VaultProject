/**
 * Password Generator Page
 * Generatore password configurabile con crypto.getRandomValues()
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, RefreshCw, Shield } from 'lucide-react';

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

    let charPool = '';
    const enabledSets = [];
    if (useLower) { charPool += CHAR_SETS.lower; enabledSets.push(CHAR_SETS.lower); }
    if (useUpper) { charPool += CHAR_SETS.upper; enabledSets.push(CHAR_SETS.upper); }
    if (useDigits) { charPool += CHAR_SETS.digits; enabledSets.push(CHAR_SETS.digits); }
    if (useSymbols) { charPool += CHAR_SETS.symbols; enabledSets.push(CHAR_SETS.symbols); }

    if (charPool.length === 0 || length < 1) return '';

    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    const chars = Array.from(randomValues, (val) => charPool[val % charPool.length]);

    if (enabledSets.length <= length) {
        const guaranteeValues = new Uint32Array(enabledSets.length);
        crypto.getRandomValues(guaranteeValues);
        enabledSets.forEach((set, i) => {
            chars[i] = set[guaranteeValues[i] % set.length];
        });
    }

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
        return Math.floor(Math.log2(WORD_LIST.length) * options.wordCount);
    }

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
    if (bits === 0) return { labelKey: '', color: 'bg-slate-600', textColor: 'text-slate-500', percent: 0 };
    if (bits < 30) return { labelKey: 'generator.strength.veryWeak', color: 'bg-red-500', textColor: 'text-red-400', percent: 10 };
    if (bits < 50) return { labelKey: 'generator.strength.weak', color: 'bg-orange-500', textColor: 'text-orange-400', percent: 25 };
    if (bits < 70) return { labelKey: 'generator.strength.fair', color: 'bg-yellow-500', textColor: 'text-yellow-400', percent: 45 };
    if (bits < 90) return { labelKey: 'generator.strength.strong', color: 'bg-blue-500', textColor: 'text-blue-400', percent: 65 };
    if (bits < 120) return { labelKey: 'generator.strength.veryStrong', color: 'bg-green-500', textColor: 'text-green-400', percent: 85 };
    return { labelKey: 'generator.strength.excellent', color: 'bg-green-400', textColor: 'text-green-400', percent: 100 };
}


export function PasswordGeneratorPage() {
    const { t } = useTranslation();
    const [mode, setMode] = useState('password');

    const [passwordOptions, setPasswordOptions] = useState({
        length: 20,
        useLower: true,
        useUpper: true,
        useDigits: true,
        useSymbols: true,
    });

    const [passphraseOptions, setPassphraseOptions] = useState({
        wordCount: 5,
        separator: '-',
        capitalize: true,
    });

    const [generatedPassword, setGeneratedPassword] = useState('');
    const [copied, setCopied] = useState(false);
    const [history, setHistory] = useState([]);

    const handleGenerate = useCallback(() => {
        let result;
        if (mode === 'password') {
            result = generatePassword(passwordOptions);
        } else {
            result = generatePassphrase(passphraseOptions);
        }
        setGeneratedPassword(result);
        setCopied(false);

        if (result) {
            setHistory(prev => [
                { value: result, mode, timestamp: Date.now() },
                ...prev.slice(0, 9)
            ]);
        }
    }, [mode, passwordOptions, passphraseOptions]);

    async function handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text || generatedPassword);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);

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

    const currentOptions = mode === 'password' ? passwordOptions : passphraseOptions;
    const entropy = calculateEntropy(generatedPassword, mode, currentOptions);
    const strength = getStrengthFromEntropy(entropy);

    const atLeastOneSet = passwordOptions.useLower || passwordOptions.useUpper
        || passwordOptions.useDigits || passwordOptions.useSymbols;

    return (
        <div className="p-6 h-full overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-4 pb-6">

                    {/* Page title */}
                    <h1 className="text-2xl font-bold text-white mb-2">{t('generator.title')}</h1>

                    {/* Output */}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="flex-1 font-mono text-sm bg-slate-900/60 border border-slate-700 px-3 py-3 rounded-lg break-all min-h-[48px] flex items-center text-gray-200">
                                {generatedPassword || (
                                    <span className="text-slate-500">
                                        {t('generator.pressGenerate')}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => handleCopy()}
                                disabled={!generatedPassword}
                                className="p-3 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-30"
                            >
                                {copied ? <Check size={22} /> : <Copy size={22} />}
                            </button>
                        </div>

                        {/* Strength bar */}
                        {generatedPassword && (
                            <div className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                    <span className={`font-semibold ${strength.textColor}`}>
                                        {strength.labelKey ? t(strength.labelKey) : ''}
                                    </span>
                                    <span className="text-slate-400">
                                        {t('generator.entropy', { bits: entropy })}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2">
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
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={20} />
                            {t('generator.generate')}
                        </button>
                    </div>

                    {/* Mode selector */}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden flex">
                        <button
                            onClick={() => { setMode('password'); setGeneratedPassword(''); }}
                            className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'password'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:bg-slate-700'
                                }`}
                        >
                            {t('generator.mode.password')}
                        </button>
                        <button
                            onClick={() => { setMode('passphrase'); setGeneratedPassword(''); }}
                            className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'passphrase'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:bg-slate-700'
                                }`}
                        >
                            {t('generator.mode.passphrase')}
                        </button>
                    </div>

                    {/* Password options */}
                    {mode === 'password' && (
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-4">
                            {/* Length slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-medium text-gray-300">{t('generator.length')}</label>
                                    <span className="text-sm font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
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
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-xs text-slate-500 mt-1">
                                    <span>4</span>
                                    <span>64</span>
                                </div>
                            </div>

                            {/* Character toggles */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">{t('generator.characters')}</label>

                                <ToggleOption
                                    label={t('generator.lowercase')}
                                    example="a-z"
                                    checked={passwordOptions.useLower}
                                    onChange={(v) => setPasswordOptions(prev => ({ ...prev, useLower: v }))}
                                    disabled={!passwordOptions.useUpper && !passwordOptions.useDigits && !passwordOptions.useSymbols && passwordOptions.useLower}
                                />
                                <ToggleOption
                                    label={t('generator.uppercase')}
                                    example="A-Z"
                                    checked={passwordOptions.useUpper}
                                    onChange={(v) => setPasswordOptions(prev => ({ ...prev, useUpper: v }))}
                                    disabled={!passwordOptions.useLower && !passwordOptions.useDigits && !passwordOptions.useSymbols && passwordOptions.useUpper}
                                />
                                <ToggleOption
                                    label={t('generator.numbers')}
                                    example="0-9"
                                    checked={passwordOptions.useDigits}
                                    onChange={(v) => setPasswordOptions(prev => ({ ...prev, useDigits: v }))}
                                    disabled={!passwordOptions.useLower && !passwordOptions.useUpper && !passwordOptions.useSymbols && passwordOptions.useDigits}
                                />
                                <ToggleOption
                                    label={t('generator.symbols')}
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
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-4">
                            {/* Word count slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-sm font-medium text-gray-300">{t('generator.words')}</label>
                                    <span className="text-sm font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
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
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between text-xs text-slate-500 mt-1">
                                    <span>3</span>
                                    <span>10</span>
                                </div>
                            </div>

                            {/* Separator */}
                            <div>
                                <label className="text-sm font-medium text-gray-300 block mb-2">{t('generator.separator')}</label>
                                <div className="flex gap-2">
                                    {['-', '.', '_', ' ', '#'].map((sep) => (
                                        <button
                                            key={sep}
                                            onClick={() => setPassphraseOptions(prev => ({ ...prev, separator: sep }))}
                                            className={`flex-1 py-2 rounded-lg border text-sm font-mono transition-colors ${passphraseOptions.separator === sep
                                                ? 'border-blue-500 bg-blue-500/10 text-blue-400 font-bold'
                                                : 'border-slate-600 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            {sep === ' ' ? '⎵' : sep}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Capitalize toggle */}
                            <ToggleOption
                                label={t('generator.capitalizeWords')}
                                example={t('generator.capitalizeExample')}
                                checked={passphraseOptions.capitalize}
                                onChange={(v) => setPassphraseOptions(prev => ({ ...prev, capitalize: v }))}
                            />
                        </div>
                    )}

                    {/* History */}
                    {history.length > 0 && (
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-gray-300">
                                    {t('generator.recent', { count: history.length })}
                                </h2>
                                <button
                                    onClick={() => setHistory([])}
                                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                    {t('generator.clear')}
                                </button>
                            </div>
                            <div className="divide-y divide-slate-700/50">
                                {history.map((item) => (
                                    <div key={item.timestamp} className="px-4 py-3 flex items-center gap-2">
                                        <div className="flex-1 font-mono text-xs text-gray-300 truncate">
                                            {item.value}
                                        </div>
                                        <span className="text-[10px] text-slate-500 uppercase flex-shrink-0">
                                            {item.mode === 'passphrase' ? 'phrase' : 'pwd'}
                                        </span>
                                        <button
                                            onClick={() => handleCopy(item.value)}
                                            className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded transition-colors flex-shrink-0"
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
        <label className={`flex items-center justify-between py-2.5 px-3 rounded-lg border transition-colors cursor-pointer ${checked
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-slate-700 hover:border-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <div className="flex items-center gap-3">
                <span className="text-sm text-gray-200">{label}</span>
                {example && (
                    <span className="text-xs text-slate-500 font-mono">{example}</span>
                )}
            </div>
            <div
                className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-slate-600'}`}
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
