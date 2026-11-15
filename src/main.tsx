import React from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AudioLines, Check, ChevronDown, Download, FileAudio2, Headphones, Pause, Play, Plus, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { BAND_LABELS, connectProcessing, formatTime, FREQUENCIES, type Settings } from './audio';
import { deleteProfile, isBuiltInPreset, loadProfiles, persistProfiles, PRESETS, resetSettings, saveProfile, type UserProfile } from './profiles';
import { encodeWav } from './wav';
import './style.css';

function App() {
  const [settings, setSettings] = React.useState<Settings>(resetSettings());
  const [preset, setPreset] = React.useState('Flat');
  const [profiles, setProfiles] = React.useState<UserProfile[]>(() => loadProfiles());
  const [selected, setSelected] = React.useState('Flat');
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState('');
  const [duration, setDuration] = React.useState(0);
  const [current, setCurrent] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [volume, setVolume] = React.useState(0.85);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState('');
  const [exporting, setExporting] = React.useState(false);
  const [exportStage, setExportStage] = React.useState('');
  const [exportProgress, setExportProgress] = React.useState(0);
  const [profileName, setProfileName] = React.useState('');
  const [showSave, setShowSave] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const contextRef = React.useRef<AudioContext | null>(null);
  const graphRef = React.useRef<ReturnType<typeof connectProcessing> | null>(null);
  const settingsRef = React.useRef(settings);
  settingsRef.current = settings;
  const maxBoost = settings.preamp + Math.max(...settings.bands);
  const clippingRisk = settings.enabled && maxBoost > 3;

  React.useEffect(() => { graphRef.current?.update(settings); }, [settings]);
  React.useEffect(() => { try { persistProfiles(profiles); } catch { setError('Не удалось сохранить профиль: в хранилище браузера закончилось место.'); } }, [profiles]);
  React.useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  React.useEffect(() => () => { if (contextRef.current) void contextRef.current.close(); }, []);
  React.useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume, url]);
  React.useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    const time = () => setCurrent(audio.currentTime), meta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0), ended = () => setPlaying(false);
    audio.addEventListener('timeupdate', time); audio.addEventListener('loadedmetadata', meta); audio.addEventListener('ended', ended);
    return () => { audio.removeEventListener('timeupdate', time); audio.removeEventListener('loadedmetadata', meta); audio.removeEventListener('ended', ended); };
  }, [url]);

  const useFile = (next: File) => {
    setError('');
    if (!next.type.startsWith('audio/') && !/\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|aiff?|weba)$/i.test(next.name)) { setError('Похоже, это не аудиофайл. Выберите MP3, WAV или другой формат, который поддерживает браузер.'); return; }
    if (!next.size) { setError('Файл пустой. Выберите другой аудиофайл.'); return; }
    setFile(next); setDuration(0); setCurrent(0); setPlaying(false);
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(next); });
  };
  const setField = (patch: Partial<Settings>) => { setSettings((old) => ({ ...old, ...patch })); setPreset('Custom'); setSelected('Custom'); };
  const changeBand = (index: number, value: number) => { const bands = [...settingsRef.current.bands]; bands[index] = value; setField({ bands }); };
  const selectPreset = (name: string) => {
    setSelected(name); setPreset(name);
    if (isBuiltInPreset(name)) setSettings({ ...PRESETS[name], bands: [...PRESETS[name].bands] });
    else { const p = profiles.find((item) => item.name === name); if (p) setSettings({ ...p.settings, bands: [...p.settings.bands] }); }
  };
  const saveCurrent = () => {
    const name = profileName.trim(); if (!name) { setError('Введите название профиля.'); return; }
    if (profiles.some((p) => p.name === name) && !window.confirm(`Профиль «${name}» уже существует. Заменить его текущими настройками?`)) return;
    try { const updated = saveProfile(profiles, { name, settings: { ...settings, bands: [...settings.bands] } }); setProfiles(updated); setSelected(name); setPreset(name); setShowSave(false); setProfileName(''); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить профиль.'); }
  };
  const removeProfile = () => {
    if (!isBuiltInPreset(selected) && profiles.some((p) => p.name === selected) && window.confirm(`Удалить профиль «${selected}»? Это действие нельзя отменить.`)) {
      const next = deleteProfile(profiles, selected); setProfiles(next); selectPreset('Flat');
    }
  };
  const togglePlay = async () => {
    const audio = audioRef.current; if (!audio || !file) return;
    if (!contextRef.current) {
      const ctx = new AudioContext();
      try { const source = ctx.createMediaElementSource(audio); const graph = connectProcessing(ctx, source, ctx.destination, settingsRef.current, true); contextRef.current = ctx; graphRef.current = graph; }
      catch { await ctx.close(); setError('Не удалось подключить аудиообработку. Попробуйте перезагрузить страницу.'); return; }
    }
    if (contextRef.current.state === 'suspended') await contextRef.current.resume();
    if (audio.paused) { try { await audio.play(); setPlaying(true); } catch { setError('Браузер не смог воспроизвести файл. Возможно, формат или кодек не поддерживается.'); } }
    else { audio.pause(); setPlaying(false); }
  };
  const exportWav = async () => {
    if (!file || exporting) return;
    if (file.size > 150 * 1024 * 1024) { setError('Этот файл больше 150 МБ. Экспорт остановлен, чтобы не исчерпать память браузера. Попробуйте аудиофайл поменьше.'); return; }
    const exportSettings: Settings = { ...settingsRef.current, bands: [...settingsRef.current.bands] };
    setExporting(true); setExportProgress(4); setExportStage('Читаем аудио локально…'); setError('');
    let decoder: AudioContext | null = null;
    try {
      const bytes = await file.arrayBuffer(); decoder = new AudioContext();
      const decoded = await decoder.decodeAudioData(bytes.slice(0));
      const channels = 2;
      const outputBytes = 44 + decoded.length * channels * 2;
      const workingBytes = decoded.length * Math.max(1, decoded.numberOfChannels) * 4 + decoded.length * channels * 4 + outputBytes;
      if (workingBytes > 700 * 1024 * 1024) throw new Error('Экспорт потребовал бы слишком много памяти (более 700 МБ). Уменьшите длительность или размер исходного файла.');
      setExportProgress(28); setExportStage('Применяем эквалайзер…');
      const offline = new OfflineAudioContext(channels, decoded.length, decoded.sampleRate);
      const source = offline.createBufferSource(); source.buffer = decoded;
      connectProcessing(offline, source, offline.destination, exportSettings, false); source.start(0);
      setExportProgress(45); setExportStage('Обрабатываем весь трек…');
      const rendered = await offline.startRendering();
      setExportProgress(88); setExportStage('Формируем WAV…');
      const blob = encodeWav(rendered); const downloadUrl = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = downloadUrl; link.download = `${file.name.replace(/\.[^.]+$/, '')}-sonora.wav`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(downloadUrl);
      setExportProgress(100); setExportStage('Готово — WAV скачан');
      window.setTimeout(() => { setExportStage(''); setExportProgress(0); }, 3500);
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось экспортировать файл.'); setExportStage(''); setExportProgress(0); }
    finally { if (decoder) void decoder.close(); setExporting(false); }
  };

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><AudioLines size={22}/></div><span>sonora<span className="brand-dot">.</span></span><span className="brand-tag">АУДИОСТУДИЯ</span></div><div className="privacy"><ShieldCheck size={15}/> Файлы не покидают ваше устройство</div></header>
    <section className="intro"><div><div className="eyebrow"><span className="eyebrow-line"/> ЗВУК ПОД ТВОИМ КОНТРОЛЕМ</div><h1>Слушай по-своему<span>.</span></h1><p>Настрой звучание. Сохрани свой профиль. Забери результат.</p></div><div className="intro-mark"><Activity size={20}/><span>ЛОКАЛЬНАЯ ОБРАБОТКА</span></div></section>
    <div className="workspace">
      <section className={`upload-card ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const dropped = e.dataTransfer.files[0]; if (dropped) useFile(dropped); }}>
        <input ref={inputRef} className="visually-hidden" type="file" accept="audio/*,.mp3,.wav,.ogg,.opus,.m4a,.aac,.flac,.aiff,.aif" onChange={(e) => { const chosen = e.target.files?.[0]; if (chosen) useFile(chosen); e.currentTarget.value = ''; }}/>
        {file ? <><div className="file-icon"><FileAudio2 size={21}/></div><div className="file-meta"><span className="file-label">СЕЙЧАС В СТУДИИ</span><strong title={file.name}>{file.name}</strong><span>{duration ? formatTime(duration) : 'Определяем длительность…'} <i/> {(file.size / 1024 / 1024).toFixed(1)} МБ</span></div><button className="change-file" onClick={() => inputRef.current?.click()} aria-label="Выбрать другой файл"><Upload size={16}/><span>Заменить файл</span></button></> : <><div className="upload-symbol"><Upload size={23}/></div><div className="upload-copy"><strong>Перетащи музыку сюда</strong><span>или выбери файл с устройства · MP3, WAV и другие</span></div><button className="browse-btn" onClick={() => inputRef.current?.click()}>Выбрать файл <Upload size={15}/></button></>}
      </section>
      {error && <div className="notice error-notice" role="alert"><span>{error}</span><button aria-label="Закрыть сообщение" onClick={() => setError('')}><X size={16}/></button></div>}
      {file && <section className="player-card"><div className="player-main"><button className="play-button" onClick={() => void togglePlay()} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause fill="currentColor" size={20}/> : <Play fill="currentColor" size={20}/>}</button><div className="timeline"><div className="time-labels"><span>{formatTime(current)}</span><span>{formatTime(duration)}</span></div><input aria-label="Позиция воспроизведения" type="range" min="0" max={duration || 0} step="0.01" value={Math.min(current, duration || 0)} style={{'--progress': `${duration ? current / duration * 100 : 0}%`} as React.CSSProperties} onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value); }}/></div><div className="volume-control">{volume === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}<input aria-label="Громкость плеера" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => { setVolume(Number(e.target.value)); if (audioRef.current) audioRef.current.volume = Number(e.target.value); }}/></div></div><audio ref={audioRef} src={url || undefined} preload="metadata" onError={() => file && setError('Не удалось декодировать файл. Убедитесь, что браузер поддерживает его аудиокодек.')}/></section>}

      <section className="eq-card">
        <div className="section-heading"><div className="section-title"><div className="heading-icon"><SlidersHorizontal size={17}/></div><div><h2>Эквалайзер</h2><span>10 полос · графическая настройка частот</span></div></div><label className="switch-row"><span>{settings.enabled ? 'Включён' : 'Обход'}</span><input type="checkbox" checked={settings.enabled} onChange={(e) => setField({ enabled: e.target.checked })} aria-label="Включить эквалайзер и обработку"/><span className="switch" aria-hidden="true"/></label></div>
        <div className={`eq-content ${!settings.enabled ? 'disabled' : ''}`}>
          <div className="eq-grid"><div className="preamp-column"><div className="slider-value">{settings.preamp > 0 ? '+' : ''}{settings.preamp}<small> dB</small></div><div className="vertical-wrap preamp-wrap"><span className="zero-tick"/><input aria-label="Предусиление, децибелы" type="range" min="-20" max="20" step="1" value={settings.preamp} onChange={(e) => setField({ preamp: Number(e.target.value) })}/></div><div className="band-label">PREAMP</div><button className="reset-mini" onClick={() => setField({ preamp: 0 })} title="Сбросить предусиление"><RotateCcw size={12}/> Сброс</button></div><div className="band-area"><div className="eq-guides"><span>+20</span><span>+10</span><span className="zero-label">0 dB</span><span>−10</span><span>−20</span></div><div className="bands">{FREQUENCIES.map((frequency, i) => { const val = settings.bands[i] ?? 0; return <div className="band-column" key={frequency}><div className="slider-value">{val > 0 ? '+' : ''}{val}<small> dB</small></div><div className="vertical-wrap"><span className="zero-tick"/><input aria-label={`${frequency >= 1000 ? `${frequency / 1000} кГц` : `${frequency} Гц`}, децибелы`} type="range" min="-20" max="20" step="1" value={val} onChange={(e) => changeBand(i, Number(e.target.value))}/></div><div className="band-label">{BAND_LABELS[i]}<small>Hz</small></div></div>; })}</div></div></div>
          <div className="eq-footer"><div className="reset-actions"><button className="text-btn" onClick={() => { setSettings((s) => ({ ...s, bands: Array(10).fill(0) })); setPreset('Custom'); setSelected('Custom'); }}><RotateCcw size={14}/> Сбросить полосы</button><button className="text-btn reset-all" onClick={() => { setSettings(resetSettings()); setPreset('Flat'); setSelected('Flat'); }}><RotateCcw size={13}/> Сбросить всё</button></div><div className="footer-controls"><label className="mono-toggle"><input type="checkbox" checked={settings.mono} onChange={(e) => setField({ mono: e.target.checked })}/><span className="checkbox-ui"/><span>Mono</span></label><span className="control-divider"/><label className="balance-control"><span>Баланс</span><span className="balance-labels">L <small>·</small> R</span><input aria-label="Баланс левого и правого каналов" type="range" min="-1" max="1" step="0.01" value={settings.balance} onChange={(e) => setField({ balance: Number(e.target.value) })}/><b>{settings.balance === 0 ? 'C' : settings.balance < 0 ? `L ${Math.round(-settings.balance * 100)}` : `R ${Math.round(settings.balance * 100)}`}</b></label></div></div>
        </div>
      </section>

      <section className="bottom-grid"><div className="profile-card"><div className="card-heading"><div><h2>Звуковые профили</h2><p>Быстрое переключение настроек</p></div><Headphones size={19}/></div><div className="profile-picker"><div className="profile-combo"><div className="select-wrap"><Headphones className="select-leading" size={17}/><select aria-label="Выбрать звуковой профиль" value={selected} onChange={(e) => selectPreset(e.target.value)}><optgroup label="Встроенные пресеты">{Object.keys(PRESETS).map((name) => <option key={name}>{name}</option>)}{preset === 'Custom' && <option>Custom</option>}</optgroup>{profiles.length > 0 && <optgroup label="Мои профили">{profiles.map((p) => <option key={p.name}>{p.name}</option>)}</optgroup>}</select><ChevronDown className="select-chevron" size={17}/></div><span className="combo-divider"/><button className="combo-action save-profile-action" onClick={() => { setProfileName(''); setShowSave(true); }} title="Сохранить текущие настройки как профиль" aria-label="Сохранить профиль"><Plus size={18}/><span>Сохранить</span></button><span className="combo-divider delete-divider"/><button className="combo-action delete-profile-action" disabled={isBuiltInPreset(selected) || !profiles.some((p) => p.name === selected)} onClick={removeProfile} title="Удалить выбранный профиль" aria-label="Удалить выбранный профиль"><Trash2 size={16}/></button></div></div><div className="profile-note"><Check size={13}/> Изменения применяются сразу к прослушиванию</div></div>
        <div className="export-card"><div className="export-copy"><div className="export-icon"><Download size={18}/></div><div><h2>Экспорт результата</h2><p>Полный трек · WAV · без нормализации</p></div></div><button className="export-button" onClick={() => void exportWav()} disabled={!file || exporting}>{exporting ? <><span className="spinner"/> Обработка…</> : <><Download size={16}/> Скачать WAV</>}</button>{clippingRisk && <div className="clip-warning" role="status">⚠ Высокое усиление может вызвать клиппинг. Нормализация и лимитер не применяются.</div>}{exportStage && <div className="export-status" role="status"><span>{exportStage}</span><span>{exportProgress}%</span><div className="progress-track"><i style={{width: `${exportProgress}%`}}/></div></div>}</div></section>
    </div>
    <footer><span>SONORA · ЛОКАЛЬНАЯ АУДИООБРАБОТКА</span><span>Твои файлы остаются на твоём устройстве</span></footer>
    {showSave && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSave(false); }}><form className="save-modal" onSubmit={(e) => { e.preventDefault(); saveCurrent(); }}><button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setShowSave(false)}><X size={18}/></button><div className="modal-symbol"><Save size={20}/></div><h2>Сохранить профиль</h2><p>Сохраним эквалайзер, предусиление, Mono и баланс.</p><label htmlFor="profile-name">Название профиля</label><input autoFocus id="profile-name" maxLength={50} placeholder="Например, Ночной джаз" value={profileName} onChange={(e) => setProfileName(e.target.value)}/><div className="modal-actions"><button type="button" className="cancel-btn" onClick={() => setShowSave(false)}>Отмена</button><button type="submit" className="save-btn"><Save size={15}/> Сохранить</button></div></form></div>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
