// Red de seguridad de renderizado: si una pantalla lanza una excepción
// (datos dañados, un caso no previsto...), se muestra un aviso recuperable en
// vez de dejar la app en blanco. La barra de pestañas queda fuera del límite,
// así que siempre se puede ir a Ajustes a importar una copia o borrar datos.

import { Component, type ComponentChildren } from 'preact';
import { navigate } from '../router';

interface Props {
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  componentDidCatch(error: Error): void {
    console.error('Error al mostrar la pantalla', error);
    this.setState({ error });
  }

  private go = (path: string) => {
    this.setState({ error: null });
    navigate(path);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div class="empty" role="alert">
        <span class="empty-ico">⚠️</span>
        <h3>Algo ha fallado al mostrar esta pantalla</h3>
        <p>{this.state.error.message || 'Error inesperado.'}</p>
        <p class="hint">
          Tus datos siguen guardados en el dispositivo. Puedes reintentar o ir a Ajustes
          para importar una copia.
        </p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
          <button class="btn" onClick={() => this.go('/')}>
            Ir a Hoy
          </button>
          <button class="btn" onClick={() => this.go('/ajustes')}>
            Ajustes
          </button>
        </div>
      </div>
    );
  }
}
