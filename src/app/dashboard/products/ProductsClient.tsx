'use client';

import { useState, useActionState, useRef, useEffect } from 'react';
import { Package, Plus, Edit, Trash2, X, Star, ChevronDown, Check } from 'lucide-react';
import { createProduct, updateProduct, deleteProduct, createProductCategory } from './actions';
import type { Product } from '@/types/database';
import { useT } from '@/components/TranslationsProvider';
import ImageUploader from '@/components/ImageUploader';

const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

type Currency = 'GEL' | 'USD';
const CURRENCY_OPTIONS: { value: Currency; symbol: string; label: string }[] = [
  { value: 'GEL', symbol: '₾', label: 'GEL ₾' },
  { value: 'USD', symbol: '$', label: 'USD $' },
];

// ── CategoryDropdown ──────────────────────────────────────────────────────────
function CategoryDropdown({
  value,
  onChange,
  categories,
  onAddCategory,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
  onAddCategory: (name: string) => Promise<void>;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    await onAddCategory(newName.trim());
    onChange(newName.trim());
    setNewName('');
    setAdding(false);
    setSaving(false);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setAdding(false); }}
        className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-left flex items-center justify-between text-sm"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value || t('products.category_placeholder')}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {categories.length === 0 && !adding ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">{t('products.no_categories')}</div>
          ) : (
            <div className="max-h-44 overflow-y-auto">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { onChange(cat); setOpen(false); }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-center justify-between"
                >
                  {cat}
                  {value === cat && <Check className="w-3.5 h-3.5 text-primary" />}
                </button>
              ))}
            </div>
          )}

          {/* Add category row */}
          {adding ? (
            <div className="px-3 py-2 border-t border-slate-100 flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                placeholder={t('products.category_add_placeholder')}
                className="flex-1 px-2 py-1 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim() || saving}
                className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? '…' : t('common.save')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full px-4 py-2.5 text-sm text-primary hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100"
            >
              <Plus className="w-3.5 h-3.5" />{t('products.category_add')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── CurrencyToggle ────────────────────────────────────────────────────────────
function CurrencyToggle({ value, onChange }: { value: Currency; onChange: (v: Currency) => void }) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden h-[42px]">
      {CURRENCY_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-3 text-sm font-medium transition-colors ${value === opt.value ? 'bg-primary text-white' : 'bg-[var(--input-background)] text-muted-foreground hover:text-foreground'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ProductsClient({
  products,
  initialCategories,
}: {
  products: Product[];
  initialCategories: string[];
  companyId: string;
}) {
  const t = useT();
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedZodiacs, setSelectedZodiacs] = useState<string[]>([]);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [currency, setCurrency] = useState<Currency>('GEL');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [createState, createAction, createPending] = useActionState(createProduct, null);
  const [updateState, updateAction, updatePending] = useActionState(updateProduct, null);

  const openCreate = () => {
    setEditing(null);
    setSelectedZodiacs([]);
    setProductImages([]);
    setCurrency('GEL');
    setSelectedCategory('');
    setModalOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setSelectedZodiacs(p.zodiac_compatibility ?? []);
    setProductImages(p.images ?? []);
    setCurrency((p.currency as Currency) ?? 'GEL');
    setSelectedCategory(p.category ?? '');
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setProductImages([]); };

  const state = editing ? updateState : createState;
  if (state?.success && modalOpen) closeModal();

  const toggleZodiac = (sign: string) => {
    setSelectedZodiacs(prev => prev.includes(sign) ? prev.filter(s => s !== sign) : [...prev, sign]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('products.delete_confirm'))) return;
    await deleteProduct(id);
  };

  const handleAddCategory = async (name: string) => {
    await createProductCategory(name);
    setCategories(prev => prev.includes(name) ? prev : [...prev, name].sort());
  };

  const currencySymbol = (c?: string | null) => c === 'USD' ? '$' : '₾';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t('products.title')}</h1>
          <p className="text-muted-foreground">{t('products.subtitle')}</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          <Plus className="w-4 h-4" />{t('products.add')}
        </button>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('products.no_products')}</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">{t('products.add')}</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map(product => (
            <div key={product.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Image */}
              <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                {product.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-12 h-12 text-slate-300" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-sm leading-tight">{product.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${product.in_stock ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {product.in_stock ? t('products.in_stock') : t('products.out_of_stock')}
                  </span>
                </div>
                {product.category && <p className="text-xs text-muted-foreground mb-2">{product.category}</p>}
                <p className="text-base font-bold text-primary mb-3">{currencySymbol(product.currency)}{product.price.toLocaleString()}</p>
                {(product.zodiac_compatibility?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1 mb-3">
                    <Star className="w-3 h-3 text-amber-500" />
                    <p className="text-xs text-muted-foreground">{product.zodiac_compatibility?.join(', ')}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button onClick={() => openEdit(product)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors">
                    <Edit className="w-3.5 h-3.5" />{t('products.edit')}
                  </button>
                  <button onClick={() => handleDelete(product.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />{t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{editing ? t('products.edit') : t('products.add')}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editing ? updateAction : createAction} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="zodiac_compatibility" value={selectedZodiacs.join(',')} />
              <input type="hidden" name="images" value={JSON.stringify(productImages)} />
              <input type="hidden" name="currency" value={currency} />
              <input type="hidden" name="category" value={selectedCategory} />
              {state?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">{t('products.name')} *</label>
                <input name="name" required defaultValue={editing?.name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('products.price')} *</label>
                  <input name="price" type="number" step="0.01" min="0" required defaultValue={editing?.price ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('products.currency')}</label>
                  <CurrencyToggle value={currency} onChange={setCurrency} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('products.category')}</label>
                <CategoryDropdown
                  value={selectedCategory}
                  onChange={setSelectedCategory}
                  categories={categories}
                  onAddCategory={handleAddCategory}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('products.material')}</label>
                <input name="material" defaultValue={editing?.material ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('products.birthstones')}</label>
                <input name="birthstones" defaultValue={editing?.birthstones ?? ''} placeholder="e.g. Ruby, Sapphire" className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('products.zodiac')}</label>
                <div className="flex flex-wrap gap-2">
                  {ZODIAC_SIGNS.map(sign => (
                    <button
                      key={sign}
                      type="button"
                      onClick={() => toggleZodiac(sign)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${selectedZodiacs.includes(sign) ? 'bg-primary text-white border-primary' : 'bg-white text-muted-foreground border-slate-200 hover:border-primary hover:text-primary'}`}
                    >
                      {sign}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('products.description')}</label>
                <textarea name="description" rows={3} defaultValue={editing?.description ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <input name="in_stock" type="checkbox" id="in_stock" value="true" defaultChecked={editing?.in_stock ?? true} className="w-4 h-4 accent-primary" />
                <label htmlFor="in_stock" className="text-sm font-medium">{t('products.in_stock')}</label>
              </div>
              <div>
                <ImageUploader
                  bucket="product-images"
                  maxImages={10}
                  value={productImages}
                  onChange={setProductImages}
                  label={t('products.images')}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t('products.cancel')}</button>
                <button type="submit" disabled={editing ? updatePending : createPending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {(editing ? updatePending : createPending) ? t('products.saving') : t('products.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
