import React, { useEffect, useRef, useState, useId } from 'react';
import { Camera, Loader2, Check, X } from 'lucide-react';
import BottomSheet from '../common/BottomSheet';
import Avatar from '../common/Avatar';
import AvatarCropper from './AvatarCropper';
import ChipInput from './ChipInput';
import { profileApi } from '../../lib/communityApi';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { BIO_MAX, avatarFileError, bioError, nameError, normalizeUsername, usernameError } from '../../lib/validate';
import { charLength } from '../../lib/format';

const GENRES = ['Melody', 'Kuthu', 'Folk', 'Classical', 'Hip-hop', 'Rock', 'Devotional', 'Indie', '90s Hits', 'Film score'];
const LANGUAGES = [['', 'No preference'], ['ta', 'Tamil'], ['en', 'English'], ['hi', 'Hindi'], ['te', 'Telugu'], ['ml', 'Malayalam'], ['kn', 'Kannada']];

const Field = ({ id, label, error, hint, children }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-semibold text-zinc-300 mb-1">{label}</label>
    {children}
    {error ? <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-rose-400">{error}</p> : hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
  </div>
);
const inputCls = 'w-full rounded-xl bg-surface-3 border border-white/10 focus:border-brand-400 focus:outline-none px-3 py-2 text-[15px] text-white placeholder:text-zinc-500';

/**
 * @param {{ profile: object, open: boolean, onClose: () => void, onSaved: (profile: object) => void }} props
 */
const EditProfileSheet = ({ profile, open, onClose, onSaved }) => {
  const uid = useId();
  const [form, setForm] = useState(null);
  const [avatar, setAvatar] = useState(undefined); // undefined = unchanged, null = removed, string = new data URL
  const [cropFile, setCropFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState('idle'); // idle | checking | ok | taken | invalid
  const [availabilityMsg, setAvailabilityMsg] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: profile.name, bio: profile.bio ?? '', location: profile.location ?? '', genres: profile.genres ?? [],
      favoriteArtists: profile.favoriteArtists ?? [], language: profile.language ?? '',
    });
    setUsername(profile.username ?? '');
    setAvatar(undefined);
    setErrors({});
    setAvailability('idle');
  }, [open, profile]);

  // Debounced uniqueness check
  const debounced = useDebouncedValue(username, 450);
  useEffect(() => {
    if (!open || !profile) return undefined;
    const v = normalizeUsername(debounced);
    if (v === profile.username) { setAvailability('idle'); return undefined; }
    const bad = usernameError(v);
    if (bad) { setAvailability('invalid'); setAvailabilityMsg(bad); return undefined; }
    let cancelled = false;
    setAvailability('checking');
    profileApi.usernameAvailable(v)
      .then((r) => { if (!cancelled) { setAvailability(r.available ? 'ok' : 'taken'); setAvailabilityMsg(r.message || ''); } })
      .catch(() => { if (!cancelled) setAvailability('idle'); });
    return () => { cancelled = true; };
  }, [debounced, open, profile]);

  if (!form) return null;
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const previewUser = { name: form.name, username: profile.username, avatarUrl: avatar === null ? null : profile.avatarUrl };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = avatarFileError(file);
    if (problem) { setErrors((x) => ({ ...x, avatar: problem })); return; }
    setErrors((x) => ({ ...x, avatar: undefined }));
    setCropFile(file);
  };

  const validate = () => {
    const e = {};
    const n = nameError(form.name); if (n) e.name = n;
    const b = bioError(form.bio); if (b) e.bio = b;
    const u = usernameError(username); if (u) e.username = u;
    if (availability === 'taken' && normalizeUsername(username) !== profile.username) e.username = 'That username is already taken.';
    return e;
  };

  const save = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const patch = {};
    if (form.name.trim() !== profile.name) patch.name = form.name.trim();
    if (normalizeUsername(username) !== profile.username) patch.username = normalizeUsername(username);
    if (form.bio.trim() !== (profile.bio ?? '')) patch.bio = form.bio.trim();
    if (form.location.trim() !== (profile.location ?? '')) patch.location = form.location.trim();
    if (JSON.stringify(form.genres) !== JSON.stringify(profile.genres ?? [])) patch.genres = form.genres;
    if (JSON.stringify(form.favoriteArtists) !== JSON.stringify(profile.favoriteArtists ?? [])) patch.favoriteArtists = form.favoriteArtists;
    if (form.language !== (profile.language ?? '')) patch.language = form.language || null;
    if (avatar !== undefined) patch.avatar = avatar;
    if (!Object.keys(patch).length) { onClose(); return; }

    setSaving(true);
    try {
      const { profile: updated } = await profileApi.update(patch);
      onSaved(updated);
      onClose();
    } catch (err) {
      setErrors({ [err.field || 'form']: err.message });
    } finally {
      setSaving(false);
    }
  };

  const bioUsed = charLength(form.bio);

  return (
    <>
      <BottomSheet open={open && !cropFile} onClose={onClose} tall title="Edit profile"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="press flex-1 py-2.5 rounded-full bg-white/10 text-white text-sm font-semibold">Cancel</button>
            <button type="submit" form={`${uid}-form`} disabled={saving || availability === 'checking'} className="press flex-1 py-2.5 rounded-full bg-brand-500 text-black text-sm font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        }>
        <form id={`${uid}-form`} onSubmit={save} className="space-y-4 py-3" noValidate>
          <div className="flex items-center gap-4">
            {avatar ? (
              <img src={avatar} alt="New profile photo preview" className="w-[72px] h-[72px] rounded-full object-cover flex-shrink-0" />
            ) : (
              <Avatar user={previewUser} size={72} />
            )}
            <div className="flex flex-col gap-1.5">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} className="sr-only" aria-label="Choose profile photo" tabIndex={-1} />
              <button type="button" onClick={() => fileRef.current?.click()} className="press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white"><Camera className="w-4 h-4" /> Change photo</button>
              {(profile.avatarUrl || avatar) && avatar !== null && (
                <button type="button" onClick={() => setAvatar(null)} className="text-xs text-zinc-400 hover:text-rose-400 text-left px-1">Remove photo</button>
              )}
              {avatar && <p className="text-[11px] text-brand-300">New photo ready. Save to apply.</p>}
              {errors.avatar && <p role="alert" className="text-xs text-rose-400">{errors.avatar}</p>}
            </div>
          </div>
          <Field id={`${uid}-name`} label="Display name" error={errors.name}>
            <input id={`${uid}-name`} value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={60} dir="auto" autoComplete="name" aria-invalid={Boolean(errors.name)} className={inputCls} />
          </Field>

          <Field id={`${uid}-user`} label="Username" error={errors.username} hint="3-20 characters. Letters, numbers and underscore.">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
              <input id={`${uid}-user`} value={username} onChange={(e) => { setUsername(e.target.value); setErrors((x) => ({ ...x, username: undefined })); }}
                maxLength={21} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(errors.username) || availability === 'taken' || availability === 'invalid'}
                aria-describedby={`${uid}-user-status`} className={`${inputCls} pl-7 pr-9`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                {availability === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
                {availability === 'ok' && <Check className="w-4 h-4 text-brand-400" />}
                {(availability === 'taken' || availability === 'invalid') && <X className="w-4 h-4 text-rose-400" />}
              </span>
            </div>
            <p id={`${uid}-user-status`} aria-live="polite" className={`mt-1 text-xs ${availability === 'ok' ? 'text-brand-300' : 'text-rose-400'}`}>
              {availability === 'ok' ? 'Username is available' : availability === 'taken' ? 'That username is already taken' : availability === 'invalid' ? availabilityMsg : ''}
            </p>
          </Field>

          <Field id={`${uid}-bio`} label="Bio" error={errors.bio}>
            <textarea id={`${uid}-bio`} value={form.bio} onChange={(e) => set('bio')(e.target.value)} rows={3} dir="auto" lang="ta" aria-invalid={Boolean(errors.bio)} className={`${inputCls} resize-none`} placeholder="Tell people what you listen to" />
            <p className={`text-right text-[11px] tabular-nums ${bioUsed > BIO_MAX ? 'text-rose-400 font-bold' : bioUsed > BIO_MAX * 0.9 ? 'text-accent-400' : 'text-zinc-500'}`}>{bioUsed}/{BIO_MAX}</p>
          </Field>

          <Field id={`${uid}-loc`} label="Location (optional)" error={errors.location}>
            <input id={`${uid}-loc`} value={form.location} onChange={(e) => set('location')(e.target.value)} maxLength={60} dir="auto" autoComplete="off" className={inputCls} placeholder="Chennai, India" />
          </Field>

          <ChipInput label="Favourite genres" values={form.genres} onChange={set('genres')} suggestions={GENRES} />
          <ChipInput label="Favourite artists" values={form.favoriteArtists} onChange={set('favoriteArtists')} placeholder="Anirudh, A.R. Rahman…" />

          <Field id={`${uid}-lang`} label="Preferred language">
            <select id={`${uid}-lang`} value={form.language} onChange={(e) => set('language')(e.target.value)} className={inputCls}>
              {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>

          {errors.form && <p role="alert" className="text-sm text-rose-400">{errors.form}</p>}
        </form>
      </BottomSheet>
      <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={(url) => { setAvatar(url); setCropFile(null); }} />
    </>
  );
};

export default EditProfileSheet;
