import React, { useMemo, useState } from 'react';
import { Check, Lock, ShoppingBag, ShieldAlert } from 'lucide-react';
import {
  ABILITIES,
  COSMETICS,
  GADGETS,
  SPEEDSTARS,
  VEHICLES,
  getCanonicalShopCatalog,
  type ShopCategory,
  type ShopCatalogItem,
} from '../shared/gameData';
import type { PlayerLoadout, PlayerProfile } from '../shared/types';

const SHOP_CATEGORIES: { id: ShopCategory; label: string }[] = [
  { id: 'abilities', label: 'Abilities' },
  { id: 'speedstars', label: 'Speedstars' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'gadgets', label: 'Arcade Gadgets' },
  { id: 'skins', label: 'Skins' },
  { id: 'trails', label: 'Trails' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'victoryAnimations', label: 'Victory Anims' },
  { id: 'collectibles', label: 'Collectibles' },
];

interface ShopPanelProps {
  profile: PlayerProfile;
  onPurchase: (itemId: string) => Promise<void>;
  onClose: () => void;
}

export const ShopPanel: React.FC<ShopPanelProps> = ({ profile, onPurchase, onClose }) => {
  const [category, setCategory] = useState<ShopCategory>('abilities');
  const [confirmItem, setConfirmItem] = useState<ShopCatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const catalog = useMemo(() => getCanonicalShopCatalog(), []);
  const items = useMemo(() => catalog.filter((i) => i.category === category), [catalog, category]);
  const unlocked = useMemo(() => new Set(profile.unlockedIds), [profile.unlockedIds]);

  const handleConfirmPurchase = async () => {
    if (!confirmItem) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await onPurchase(confirmItem.id);
      setConfirmItem(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Purchase failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <ShoppingBag className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">Speedstars Marketplace</h2>
            <p className="text-xs text-slate-400">Permanent server-validated unlocks · Balance: <span className="text-amber-400 font-mono-tabular font-semibold">{profile.speedCredits.toLocaleString()} SC</span></p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
        >
          Close
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-white/10 overflow-x-auto custom-scroll">
        {SHOP_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              category === c.id
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'bg-slate-900/70 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {items.map((item) => {
          const owned = unlocked.has(item.id);
          const canAfford = profile.speedCredits >= item.price;
          return (
            <div
              key={item.id}
              className="bg-[#121A2B] border border-white/10 rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: item.accentColor }}
                    />
                    <h3 className="text-sm font-semibold text-white truncate">{item.name}</h3>
                  </div>
                  {item.rankedAllowed === false && (
                    <span className="text-[11px] text-amber-300 whitespace-nowrap shrink-0">Unranked Only</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{item.meta}</div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{item.description}</p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <span className="font-mono-tabular text-sm font-bold text-amber-400">
                  {item.price === 0 ? 'Starter' : `${item.price.toLocaleString()} SC`}
                </span>
                {owned ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                    <Check className="w-3.5 h-3.5" /> Owned
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setErrorMsg(null);
                      setConfirmItem(item);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      canAfford
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {canAfford ? 'Purchase' : 'Inspect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Purchase Confirmation Modal */}
      {confirmItem && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md bg-[#0E1525] border border-white/15 rounded-2xl p-6 shadow-2xl">
            <h3 className="font-display text-xl font-bold text-white">{confirmItem.name}</h3>
            <p className="text-xs text-slate-400 mt-1">{confirmItem.meta}</p>
            <p className="text-sm text-slate-300 mt-3">{confirmItem.description}</p>

            <div className="mt-4 p-3 rounded-xl bg-slate-900/90 border border-white/10 flex items-center justify-between text-sm">
              <span className="text-slate-400">Price</span>
              <span className="font-mono-tabular font-bold text-amber-400">
                {confirmItem.price.toLocaleString()} SC
              </span>
            </div>

            {profile.speedCredits < confirmItem.price && (
              <div className="mt-3 flex items-center gap-2 text-xs text-rose-400">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  Need {(confirmItem.price - profile.speedCredits).toLocaleString()} more SC. Complete races (+5,000 SC/round) and Missions!
                </span>
              </div>
            )}

            {errorMsg && <div className="mt-3 text-xs text-rose-400">{errorMsg}</div>}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmItem(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={busy || profile.speedCredits < confirmItem.price}
                onClick={handleConfirmPurchase}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold"
              >
                {busy ? 'Processing...' : 'Confirm Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface GaragePanelProps {
  profile: PlayerProfile;
  onSaveLoadout: (loadout: PlayerLoadout) => Promise<void>;
  onClose: () => void;
}

export const GaragePanel: React.FC<GaragePanelProps> = ({ profile, onSaveLoadout, onClose }) => {
  const unlocked = new Set(profile.unlockedIds);
  const loadout = profile.loadout;
  const activeStar = SPEEDSTARS.find((s) => s.id === loadout.speedstarId) ?? SPEEDSTARS[0];

  const toggleAbility = (abilityId: string) => {
    const exists = loadout.abilityIds.includes(abilityId);
    let next: string[];
    if (exists) {
      next = loadout.abilityIds.filter((id) => id !== abilityId);
    } else if (loadout.abilityIds.length < 3) {
      next = [...loadout.abilityIds, abilityId];
    } else {
      next = [...loadout.abilityIds.slice(1), abilityId];
    }
    onSaveLoadout({ ...loadout, abilityIds: next });
  };

  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Garage & Loadout</h2>
          <p className="text-xs text-slate-400">
            Active Speedstar: <span className="text-cyan-400 font-semibold">{activeStar.name}</span> · Equip up to 3 Abilities, Vehicle, Gadget & Cosmetics
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Abilities Loadout (Max 3) */}
        <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-base font-bold text-white">
              Equipped Abilities ({loadout.abilityIds.length} / 3)
            </h3>
            <span className="text-xs text-slate-400">Ranked restricts Flight & Gravity Control</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scroll pr-1">
            {ABILITIES.filter((ab) => !ab.ownerOnly || unlocked.has(ab.id)).map((ab) => {
              const owned = unlocked.has(ab.id);
              const equipped = loadout.abilityIds.includes(ab.id);
              return (
                <button
                  key={ab.id}
                  disabled={!owned}
                  onClick={() => toggleAbility(ab.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                    equipped
                      ? 'bg-cyan-500/15 border-cyan-400/50 text-white'
                      : owned
                      ? 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                      : 'bg-slate-950/50 border-white/5 text-slate-500 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span>{ab.name}</span>
                      {!ab.rankedAllowed && <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{ab.description}</div>
                  </div>
                  <span className="text-xs font-semibold whitespace-nowrap shrink-0">
                    {equipped ? 'Equipped' : owned ? 'Equip' : `${ab.price.toLocaleString()} SC`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Vehicles, Gadgets & Cosmetics */}
        <div className="space-y-5">
          <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5">
            <h3 className="font-display text-base font-bold text-white mb-3">Vehicles ([V] Toggle in Race)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => onSaveLoadout({ ...loadout, vehicleId: null })}
                className={`px-3 py-2 rounded-lg border text-xs font-medium text-left ${
                  loadout.vehicleId === null
                    ? 'bg-cyan-500/15 border-cyan-400/50 text-white'
                    : 'bg-slate-900/60 border-white/10 text-slate-300'
                }`}
              >
                On Foot Only (Pure Speedstar)
              </button>
              {VEHICLES.map((v) => {
                const owned = unlocked.has(v.id);
                const equipped = loadout.vehicleId === v.id;
                return (
                  <button
                    key={v.id}
                    disabled={!owned}
                    onClick={() => onSaveLoadout({ ...loadout, vehicleId: v.id })}
                    className={`px-3 py-2 rounded-lg border text-xs text-left ${
                      equipped
                        ? 'bg-cyan-500/15 border-cyan-400/50 text-white font-semibold'
                        : owned
                        ? 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/25'
                        : 'bg-slate-950/50 border-white/5 text-slate-500 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div className="truncate">{v.name}</div>
                    <div className="text-[10px] text-slate-400">{owned ? v.category : `${v.price.toLocaleString()} SC`}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#121A2B] border border-white/10 rounded-xl p-5">
            <h3 className="font-display text-base font-bold text-white mb-3">Arcade Gadget ([X]) & Cosmetics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GADGETS.map((g) => {
                const owned = unlocked.has(g.id);
                const equipped = loadout.gadgetId === g.id;
                return (
                  <button
                    key={g.id}
                    disabled={!owned}
                    onClick={() => onSaveLoadout({ ...loadout, gadgetId: equipped ? null : g.id })}
                    className={`px-3 py-2 rounded-lg border text-xs text-left ${
                      equipped
                        ? 'bg-pink-500/15 border-pink-400/50 text-white font-semibold'
                        : owned
                        ? 'bg-slate-900/60 border-white/10 text-slate-300'
                        : 'bg-slate-950/50 border-white/5 text-slate-500 opacity-55 cursor-not-allowed'
                    }`}
                  >
                    <div className="truncate">{g.name}</div>
                    <div className="text-[10px] text-slate-400">{owned ? 'Owned' : `${g.price.toLocaleString()} SC`}</div>
                  </button>
                );
              })}
              {COSMETICS.filter((c) => unlocked.has(c.id)).map((c) => {
                const slotKey =
                  c.category === 'skins'
                    ? 'skinId'
                    : c.category === 'trails'
                    ? 'trailId'
                    : c.category === 'emotes'
                    ? 'emoteId'
                    : c.category === 'victoryAnimations'
                    ? 'victoryAnimId'
                    : null;
                if (!slotKey) return null;
                const equipped = loadout[slotKey] === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSaveLoadout({ ...loadout, [slotKey]: equipped ? null : c.id })}
                    className={`px-3 py-2 rounded-lg border text-xs text-left ${
                      equipped
                        ? 'bg-amber-500/15 border-amber-400/50 text-white font-semibold'
                        : 'bg-slate-900/60 border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-400">{equipped ? 'Equipped' : 'Tap to equip'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
