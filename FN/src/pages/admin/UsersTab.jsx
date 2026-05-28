import { useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  getUsers,
  updateUser,
} from "../../api";
import { useAuth } from "../../auth.jsx";

const EMPTY = { email: "", password: "", full_name: "", role: "user" };

export default function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null); // null | "new" | user
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startNew = () => {
    setEditing("new");
    setForm(EMPTY);
    setFormError(null);
  };
  const startEdit = (u) => {
    setEditing(u);
    setForm({
      email: u.email,
      password: "",
      full_name: u.full_name || "",
      role: u.role,
    });
    setFormError(null);
  };
  const cancel = () => {
    setEditing(null);
    setFormError(null);
  };

  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing === "new") {
        await createUser({
          email: form.email,
          password: form.password,
          full_name: form.full_name || null,
          role: form.role,
        });
      } else {
        const payload = {
          email: form.email !== editing.email ? form.email : undefined,
          full_name:
            form.full_name !== (editing.full_name || "")
              ? form.full_name || null
              : undefined,
          role: form.role !== editing.role ? form.role : undefined,
          password: form.password ? form.password : undefined,
        };
        // Drop undefineds
        Object.keys(payload).forEach(
          (k) => payload[k] === undefined && delete payload[k]
        );
        if (Object.keys(payload).length === 0) {
          cancel();
          return;
        }
        await updateUser(editing.id, payload);
      }
      cancel();
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (u) => {
    if (!confirm(`Delete user ${u.email}?`)) return;
    try {
      await deleteUser(u.id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="admin-head">
        <h2>Users</h2>
        <div className="row-gap">
          <button className="link-btn" onClick={load}>
            Refresh
          </button>
          <button className="primary-btn small" onClick={startNew}>
            + Add user
          </button>
        </div>
      </div>

      {loading && <p className="status">Loading…</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {!loading && !error && (
        <div className="table-wrap">
          <table className="bookings-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>#{u.id}</td>
                  <td>{u.email}</td>
                  <td>{u.full_name || "—"}</td>
                  <td>
                    <span className={`role-tag role-${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    {u.created_at
                      ? new Date(u.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => startEdit(u)}>
                      Edit
                    </button>
                    <button
                      className="link-btn danger"
                      onClick={() => onDelete(u)}
                      disabled={me?.id === u.id}
                      title={
                        me?.id === u.id
                          ? "You can't delete your own account"
                          : ""
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={cancel}>
          <form
            className="card modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSave}
          >
            <h3>
              {editing === "new" ? "New user" : `Edit ${editing.email}`}
            </h3>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={onChange("email")}
                required
              />
            </label>
            <label>
              Full name
              <input
                type="text"
                value={form.full_name}
                onChange={onChange("full_name")}
              />
            </label>
            <label>
              Password{" "}
              {editing !== "new" && (
                <span className="demo-note"> (leave blank to keep current)</span>
              )}
              <input
                type="password"
                value={form.password}
                onChange={onChange("password")}
                minLength={editing === "new" ? 6 : 0}
                required={editing === "new"}
              />
            </label>
            <label>
              Role
              <select value={form.role} onChange={onChange("role")}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>

            {formError && <p className="status error">⚠️ {formError}</p>}

            <div className="modal-actions">
              <button type="button" className="link-btn" onClick={cancel}>
                Cancel
              </button>
              <button type="submit" className="primary-btn small" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
