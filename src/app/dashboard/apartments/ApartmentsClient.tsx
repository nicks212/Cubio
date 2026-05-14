'use client';

import { useState, useActionState } from 'react';
import { Home, Plus, Edit, Trash2, X, Grid3x3, List, Wand2, Layers } from 'lucide-react';
import {
  createApartment, updateApartment, deleteApartment,
  updateApartmentStatus, bulkCreateApartments, createTemplate, deleteTemplate,
} from './actions';
import type { Apartment, ApartmentTemplate, Project } from '@/types/database';
import { useT } from '@/components/TranslationsProvider';
import ImageUploader from '@/components/ImageUploader';

type ApartmentWithProject = Omit<Apartment, 'project'> & {
  project?: { name: string } | null;
};

interface Props {
  apartments: ApartmentWithProject[];
  projects: Pick<Project, 'id' | 'name' | 'total_floors'>[];
  templates: ApartmentTemplate[];
  companyId: string;
}

const statusColors = {
  vacant: 'bg-green-100 text-green-700 border-green-200',
  reserved: 'bg-amber-100 text-amber-700 border-amber-200',
  sold: 'bg-slate-100 text-slate-700 border-slate-200',
};

type ModalType = 'single' | 'bulk' | 'template' | null;

export default function ApartmentsClient({ apartments, projects, templates, companyId }: Props) {
  const t = useT();
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [modal, setModal] = useState<ModalType>(null);
  const [editing, setEditing] = useState<ApartmentWithProject | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [aptImages, setAptImages] = useState<string[]>([]);
  const [templateImages, setTemplateImages] = useState<string[]>([]);

  const [createState, createAction, createPending] = useActionState(createApartment, null);
  const [updateState, updateAction, updatePending] = useActionState(updateApartment, null);
  const [templateState, templateAction, templatePending] = useActionState(createTemplate, null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const [bulkForm, setBulkForm] = useState({
    templateId: '', projectId: '',
    startFloor: 1, endFloor: 5, unitsPerFloor: 4, priceAdjustment: 0,
  });

  const filtered = apartments.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (projectFilter !== 'all' && a.project_id !== projectFilter) return false;
    return true;
  });

  const openEdit = (a: ApartmentWithProject) => { setEditing(a); setAptImages(a.images ?? []); setModal('single'); };
  const closeModal = () => { setModal(null); setEditing(null); setAptImages([]); setTemplateImages([]); };
  const openCreateSingle = () => { setEditing(null); setAptImages([]); setModal('single'); };

  if ((editing ? updateState : createState)?.success && modal === 'single') closeModal();
  if (templateState?.success && modal === 'template') closeModal();

  const handleBulkCreate = async () => {
    const tpl = templates.find(t => t.id === bulkForm.templateId);
    if (!tpl || !bulkForm.projectId) return;
    setBulkLoading(true);
    const result = await bulkCreateApartments({
      company_id: companyId,
      project_id: bulkForm.projectId,
      template_size: tpl.size_sq_m,
      template_rooms: tpl.rooms_quantity,
      template_price: tpl.price_per_sq_m,
      start_floor: bulkForm.startFloor,
      end_floor: bulkForm.endFloor,
      units_per_floor: bulkForm.unitsPerFloor,
      price_adjustment: bulkForm.priceAdjustment,
    });
    setBulkLoading(false);
    if (result.success) {
      setBulkResult(`Created ${result.count} apartments`);
      setTimeout(() => { closeModal(); setBulkResult(null); }, 2000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this apartment?')) return;
    await deleteApartment(id);
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateApartmentStatus(id, status);
  };

  const formDefaults = (a?: ApartmentWithProject | null) => ({
    project_id: a?.project_id ?? projects[0]?.id ?? '',
    apartment_number: a?.apartment_number ?? '',
    size_sq_m: a?.size_sq_m ?? 0,
    floor: a?.floor ?? 1,
    rooms_quantity: a?.rooms_quantity ?? 1,
    price_per_sq_m: a?.price_per_sq_m ?? 0,
    total_price: a?.total_price ?? 0,
    status: a?.status ?? 'vacant',
    description: a?.description ?? '',
  });

  const df = formDefaults(editing);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{t('apartments.title')}</h1>
          <p className="text-muted-foreground">{t('apartments.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('template')} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-foreground rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
            <Wand2 className="w-4 h-4" />{t('apartments.templates')}
          </button>
          <button onClick={() => setModal('bulk')} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-foreground rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium">
            <Layers className="w-4 h-4" />{t('apartments.bulk_add')}
          </button>
          <button onClick={openCreateSingle} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm">
            <Plus className="w-4 h-4" />{t('apartments.add')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="all">All Statuses</option>
          <option value="vacant">Vacant</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </select>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto flex border border-slate-200 rounded-lg overflow-hidden">
          <button onClick={() => setView('grid')} className={`p-2 ${view === 'grid' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-slate-50'}`}><Grid3x3 className="w-4 h-4" /></button>
          <button onClick={() => setView('table')} className={`p-2 ${view === 'table' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-slate-50'}`}><List className="w-4 h-4" /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Home className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No apartments found.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(apt => (
            <div key={apt.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold">{apt.apartment_number}</span>
                <select
                  value={apt.status}
                  onChange={e => handleStatusChange(apt.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded-full border font-medium focus:outline-none cursor-pointer ${statusColors[apt.status]}`}
                >
                  <option value="vacant">Vacant</option>
                  <option value="reserved">Reserved</option>
                  <option value="sold">Sold</option>
                </select>
              </div>
              <p className="text-sm text-muted-foreground mb-1">{apt.project?.name}</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground mb-3">
                <span>Floor {apt.floor}</span>
                <span>{apt.rooms_quantity} rooms</span>
                <span>{apt.size_sq_m} m²</span>
                <span>${apt.price_per_sq_m.toLocaleString()}/m²</span>
              </div>
              <p className="text-sm font-semibold text-foreground mb-3">${apt.total_price.toLocaleString()}</p>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button onClick={() => openEdit(apt)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors">
                  <Edit className="w-3.5 h-3.5" />Edit
                </button>
                <button onClick={() => handleDelete(apt.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['#', 'Project', 'Floor', 'Rooms', 'Size', 'Price/m²', 'Total', 'Status', ''].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(apt => (
                  <tr key={apt.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-medium text-sm">{apt.apartment_number}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{apt.project?.name}</td>
                    <td className="py-3 px-4 text-sm">{apt.floor}</td>
                    <td className="py-3 px-4 text-sm">{apt.rooms_quantity}</td>
                    <td className="py-3 px-4 text-sm">{apt.size_sq_m}m²</td>
                    <td className="py-3 px-4 text-sm">${apt.price_per_sq_m.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm font-semibold">${apt.total_price.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <select value={apt.status} onChange={e => handleStatusChange(apt.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full border font-medium focus:outline-none cursor-pointer ${statusColors[apt.status]}`}>
                        <option value="vacant">Vacant</option>
                        <option value="reserved">Reserved</option>
                        <option value="sold">Sold</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(apt)} className="p-1.5 hover:bg-slate-100 rounded text-muted-foreground hover:text-foreground"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(apt.id)} className="p-1.5 hover:bg-red-50 rounded text-muted-foreground hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Single Apartment Modal */}
      {modal === 'single' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{editing ? t('apartments.edit') : t('apartments.create')}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={editing ? updateAction : createAction} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="images" value={JSON.stringify(aptImages)} />
              {(editing ? updateState : createState)?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{(editing ? updateState : createState)?.error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">{t('apartments.project')} *</label>
                <select name="project_id" defaultValue={df.project_id} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('apartments.number')} *</label>
                  <input name="apartment_number" required defaultValue={df.apartment_number} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('apartments.floor')} *</label>
                  <input name="floor" type="number" min="1" required defaultValue={df.floor} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('apartments.size')} *</label>
                  <input name="size_sq_m" type="number" step="0.01" min="0" required defaultValue={df.size_sq_m} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('apartments.rooms')} *</label>
                  <input name="rooms_quantity" type="number" min="1" required defaultValue={df.rooms_quantity} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('apartments.price_per_sqm')} *</label>
                  <input name="price_per_sq_m" type="number" min="0" required defaultValue={df.price_per_sq_m} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('apartments.total_price')} *</label>
                  <input name="total_price" type="number" min="0" required defaultValue={df.total_price} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('apartments.status_label')}</label>
                <select name="status" defaultValue={df.status} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="vacant">{t('apartments.status_vacant')}</option>
                  <option value="reserved">{t('apartments.status_reserved')}</option>
                  <option value="sold">{t('apartments.status_sold')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('apartments.description')}</label>
                <textarea name="description" rows={2} defaultValue={df.description} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div>
                <ImageUploader
                  bucket="apartment-images"
                  maxImages={10}
                  value={aptImages}
                  onChange={setAptImages}
                  label={t('apartments.images')}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors font-medium">{t('apartments.cancel')}</button>
                <button type="submit" disabled={editing ? updatePending : createPending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50">
                  {(editing ? updatePending : createPending) ? t('apartments.saving') : t('apartments.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Modal */}
      {modal === 'bulk' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{t('apartments.bulk_title')}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {bulkResult && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{bulkResult}</div>}
              {templates.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">Create a template first to use bulk add.</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Template *</label>
                <select value={bulkForm.templateId} onChange={e => setBulkForm(f => ({ ...f, templateId: e.target.value }))} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Select template...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rooms_quantity}BR, {t.size_sq_m}m²)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Project *</label>
                <select value={bulkForm.projectId} onChange={e => setBulkForm(f => ({ ...f, projectId: e.target.value }))} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Floor</label>
                  <input type="number" min="1" value={bulkForm.startFloor} onChange={e => setBulkForm(f => ({ ...f, startFloor: +e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Floor</label>
                  <input type="number" min="1" value={bulkForm.endFloor} onChange={e => setBulkForm(f => ({ ...f, endFloor: +e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Units/Floor</label>
                  <input type="number" min="1" value={bulkForm.unitsPerFloor} onChange={e => setBulkForm(f => ({ ...f, unitsPerFloor: +e.target.value }))} className="w-full px-3 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Price Adjustment per Floor (%)</label>
                <input type="number" step="0.1" value={bulkForm.priceAdjustment} onChange={e => setBulkForm(f => ({ ...f, priceAdjustment: +e.target.value }))} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <p className="text-xs text-muted-foreground mt-1">e.g. 1 = 1% more expensive per floor</p>
              </div>
              <p className="text-sm text-muted-foreground bg-slate-50 rounded-lg px-4 py-3">
                {t('apartments.bulk_will_create')} <strong>{(bulkForm.endFloor - bulkForm.startFloor + 1) * bulkForm.unitsPerFloor}</strong> {t('apartments.bulk_apartments')}
              </p>
              <div className="flex gap-3">
                <button onClick={closeModal} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t('apartments.cancel')}</button>
                <button onClick={handleBulkCreate} disabled={bulkLoading || !bulkForm.templateId || !bulkForm.projectId} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                  {bulkLoading ? t('apartments.bulk_creating') : t('apartments.bulk_create')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {modal === 'template' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold">{t('apartments.template_title')}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {/* Existing Templates */}
              {templates.length > 0 && (
                <div className="mb-6 space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t('apartments.template_existing')}</h3>
                  {templates.map(tpl => (
                    <div key={tpl.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {tpl.images?.[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={tpl.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{tpl.name}</p>
                          <p className="text-xs text-muted-foreground">{tpl.rooms_quantity}BR · {tpl.size_sq_m}m² · ${tpl.price_per_sq_m.toLocaleString()}/m²</p>
                        </div>
                      </div>
                      <button onClick={() => deleteTemplate(tpl.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Create Template Form */}
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t('apartments.template_create')}</h3>
              {templateState?.error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{templateState.error}</div>}
              <form action={templateAction} className="space-y-3">
                <input type="hidden" name="images" value={JSON.stringify(templateImages)} />
                <input name="name" required placeholder={t('apartments.template_name_placeholder')} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <div className="grid grid-cols-3 gap-3">
                  <input name="size_sq_m" type="number" required placeholder="m²" className="w-full px-3 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <input name="rooms_quantity" type="number" min="1" required placeholder={t('apartments.rooms')} className="w-full px-3 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <input name="price_per_sq_m" type="number" required placeholder={t('apartments.price_per_sqm')} className="w-full px-3 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <ImageUploader
                  bucket="apartment-images"
                  maxImages={10}
                  value={templateImages}
                  onChange={setTemplateImages}
                  label={t('apartments.template_images')}
                />
                <div className="flex gap-3">
                  <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-100 rounded-lg hover:bg-slate-200 font-medium">{t('apartments.template_close')}</button>
                  <button type="submit" disabled={templatePending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50">
                    {templatePending ? t('apartments.template_saving') : t('apartments.template_save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
