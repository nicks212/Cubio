'use client';

import { useState, useActionState } from 'react';
import { Building2, Plus, Edit, Trash2, X, MapPin, Calendar, Layers, ImageIcon } from 'lucide-react';
import { createProject, updateProject, deleteProject } from './actions';
import type { Project } from '@/types/database';
import { formatDate } from '@/lib/utils';
import { useT } from '@/components/TranslationsProvider';
import ImageUploader from '@/components/ImageUploader';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-700',
  construction: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
};

export default function ProjectsClient({ projects }: { projects: Project[] }) {
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [projectImages, setProjectImages] = useState<string[]>([]);

  const [createState, createAction, createPending] = useActionState(createProject, null);
  const [updateState, updateAction, updatePending] = useActionState(updateProject, null);

  const openCreate = () => { setEditing(null); setProjectImages([]); setModalOpen(true); };
  const openEdit = (p: Project) => { setEditing(p); setProjectImages(p.images ?? []); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); setProjectImages([]); };

  const handleDelete = async (id: string) => {
    if (!confirm(t('projects.delete_confirm'))) return;
    await deleteProject(id);
  };

  const state = editing ? updateState : createState;
  const action = editing ? updateAction : createAction;
  const pending = editing ? updatePending : createPending;

  if (state?.success && modalOpen) closeModal();

  const statusLabels: Record<string, string> = {
    planning: t('projects.status_planning'),
    construction: t('projects.status_construction'),
    completed: t('projects.status_completed'),
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Projects</h1>
          <p className="text-muted-foreground">Manage your real estate development projects</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('projects.add')}
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('projects.no_projects')}</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
            {t('projects.add')}
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
              {project.images?.[0] ? (
                <div className="h-40 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={project.images[0]} alt={project.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-40 bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                  <Building2 className="w-12 h-12 text-blue-300" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold leading-tight">{project.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ml-2 flex-shrink-0 ${statusColors[project.status] ?? ''}`}>
                    {statusLabels[project.status]}
                  </span>
                </div>
                <div className="space-y-1 mb-4">
                  {project.location && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />{project.location}
                    </p>
                  )}
                  {project.completion_date && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />{formatDate(project.completion_date)}
                    </p>
                  )}
                  {project.total_floors && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />{project.total_floors} {t('projects.floors')}
                    </p>
                  )}
                  {(project.images?.length ?? 0) > 0 && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />{project.images.length} {t('image.photos')}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 pt-4 border-t border-slate-100">
                  <button onClick={() => openEdit(project)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors">
                    <Edit className="w-4 h-4" />{t('projects.edit')}
                  </button>
                  <button onClick={() => handleDelete(project.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />{t('common.delete')}
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
              <h2 className="text-xl font-semibold">{editing ? t('projects.edit') : t('projects.add')}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={action} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="images" value={JSON.stringify(projectImages)} />
              {state?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">{t('projects.name')} *</label>
                <input name="name" required defaultValue={editing?.name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('projects.location')}</label>
                <input name="location" defaultValue={editing?.location ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{t('projects.completion_date')}</label>
                  <input name="completion_date" type="date" defaultValue={editing?.completion_date ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">{t('projects.total_floors')}</label>
                  <input name="total_floors" type="number" min="1" defaultValue={editing?.total_floors ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('projects.status')} *</label>
                <select name="status" defaultValue={editing?.status ?? 'planning'} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="planning">{t('projects.status_planning')}</option>
                  <option value="construction">{t('projects.status_construction')}</option>
                  <option value="completed">{t('projects.status_completed')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('projects.description')}</label>
                <textarea name="description" rows={3} defaultValue={editing?.description ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div>
                <ImageUploader
                  bucket="project-images"
                  maxImages={3}
                  value={projectImages}
                  onChange={setProjectImages}
                  label={t('projects.images')}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-100 text-foreground rounded-lg hover:bg-slate-200 transition-colors font-medium">{t('projects.cancel')}</button>
                <button type="submit" disabled={pending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50">
                  {pending ? t('projects.saving') : t('projects.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
