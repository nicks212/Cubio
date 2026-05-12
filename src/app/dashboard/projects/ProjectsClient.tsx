'use client';

import { useState, useActionState } from 'react';
import { Building2, Plus, Edit, Trash2, X, MapPin, Calendar, Layers } from 'lucide-react';
import { createProject, updateProject, deleteProject } from './actions';
import type { Project } from '@/types/database';
import { formatDate } from '@/lib/utils';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-700',
  construction: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
};

const statusLabels: Record<string, string> = {
  planning: 'Planning',
  construction: 'Under Construction',
  completed: 'Completed',
};

export default function ProjectsClient({ projects }: { projects: Project[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [createState, createAction, createPending] = useActionState(createProject, null);
  const [updateState, updateAction, updatePending] = useActionState(updateProject, null);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p: Project) => { setEditing(p); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project? All apartments will also be deleted.')) return;
    await deleteProject(id);
  };

  const state = editing ? updateState : createState;
  const action = editing ? updateAction : createAction;
  const pending = editing ? updatePending : createPending;

  // Auto close on success
  if (state?.success && modalOpen) closeModal();

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
          Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">No projects yet. Create your first project.</p>
          <button onClick={openCreate} className="mt-4 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
            Add Project
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[project.status] ?? ''}`}>
                  {statusLabels[project.status]}
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2">{project.name}</h3>
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
                    <Layers className="w-3.5 h-3.5" />{project.total_floors} floors
                  </p>
                )}
              </div>
              <div className="flex gap-2 pt-4 border-t border-slate-100">
                <button onClick={() => openEdit(project)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-slate-100 rounded-lg transition-colors">
                  <Edit className="w-4 h-4" />Edit
                </button>
                <button onClick={() => handleDelete(project.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />Delete
                </button>
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
              <h2 className="text-xl font-semibold">{editing ? 'Edit Project' : 'Add Project'}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form action={action} className="p-6 space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              {state?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">Project Name *</label>
                <input name="name" required defaultValue={editing?.name ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Location</label>
                <input name="location" defaultValue={editing?.location ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Completion Date</label>
                  <input name="completion_date" type="date" defaultValue={editing?.completion_date ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Total Floors</label>
                  <input name="total_floors" type="number" min="1" defaultValue={editing?.total_floors ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status *</label>
                <select name="status" defaultValue={editing?.status ?? 'planning'} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="planning">Planning</option>
                  <option value="construction">Under Construction</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea name="description" rows={3} defaultValue={editing?.description ?? ''} className="w-full px-4 py-2.5 bg-[var(--input-background)] border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-100 text-foreground rounded-lg hover:bg-slate-200 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={pending} className="flex-1 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50">
                  {pending ? 'Saving...' : 'Save Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
