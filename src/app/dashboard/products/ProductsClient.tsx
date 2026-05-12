'use client';

import { useState, useActionState } from 'react';
import { Package, Plus, Edit, Trash2, X, Star } from 'lucide-react';
import { createProduct, updateProduct, deleteProduct } from './actions';
import type { Product } from '@/types/database';

const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

export default function ProductsClient({ products }: { products: Product[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedZodiacs, setSelectedZodiacs] = useState<string[]>([]);
  const [createState, createAction, createPending] = useActionState(createProduct, null);
  const [updateState, updateAction, updatePending] = useActionState(updateProduct, null);

  const openCreate = () => { setEditing(null); setSelectedZodiacs([]); setModalOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setSelectedZodiacs(p.zodiac_compatibility ?? []); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const state = editing ? updateState : createState;
  if (state?.success && modalOpen) closeModal();

  const toggleZodiac = (sign: string) => {
    setSelectedZodiacs(prev => prev.includes(sign) ? prev.filter(s => s !== sign) : [...prev, sign]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    await deleteProduct(id);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Products</h1>
          <p className="text-muted-foreground">Manage your craft products and gemstones</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          <Plus className="w-4 h-4" />Add Product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No products yet. Add your first product.</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">Add Product</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map(product => (
            <div key={product.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Image placeholder */}
              <div className="aspect-square bg-slate-100 flex items-center justify-center">
                <Package className="w-12 h-12 text-slate-300" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-sm leading-tight">{product.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${product.in_stock ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {product.in_stock ? 'In Stock' : 'Out'}
                  </span>
                </div>
                {product.category && <p className="text-xs text-muted-foreground mb-2">{product.category}</p>}
                <p className="text-base font-bold text-primary mb-3">${product.price.toLocaleString()}</p>
                {(product.zodiac_compatibility?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1 mb-3">
                    <Star className="w-3 h-3 text-amber-500" />
                    <p className="text-xs text-muted-foreground">{product.zodiac_compatibility?.join(', ')}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button onClick={() => openEdit(product)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors">
                    <Edit className="w-3.5 h-3.5" />Edit
                  </button>
                  <button onClick={() => handleDelete(product.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />Delete
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
              <h2 className="text-xl font-semibold">{editing ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editing ? updateAction : createAction} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="zodiac_compatibility" value={selectedZodiacs.join(',')} />
              {state?.error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>}
              <div>
                <label className="block text-sm font-medium mb-2">Product Name *</label>
                <input name="name" required defaultValue={editing?.name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Price *</label>
                  <input name="price" type="number" step="0.01" min="0" required defaultValue={editing?.price ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Category</label>
                  <input name="category" defaultValue={editing?.category ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Material</label>
                <input name="material" defaultValue={editing?.material ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Birthstones</label>
                <input name="birthstones" defaultValue={editing?.birthstones ?? ''} placeholder="e.g. Ruby, Sapphire" className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Zodiac Compatibility</label>
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
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea name="description" rows={3} defaultValue={editing?.description ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div className="flex items-center gap-3">
                <input name="in_stock" type="checkbox" id="in_stock" value="true" defaultChecked={editing?.in_stock ?? true} className="w-4 h-4 accent-primary" />
                <label htmlFor="in_stock" className="text-sm font-medium">In Stock</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">Cancel</button>
                <button type="submit" disabled={editing ? updatePending : createPending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {(editing ? updatePending : createPending) ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
