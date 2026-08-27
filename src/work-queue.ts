// Fila simples para limitar trabalho pesado concorrente (FFmpeg, análise de mídia etc.).
// Mantém ordem FIFO, libera a vaga mesmo quando a tarefa falha e evita que
// várias transcodificações concorrentes tornem a interface inutilizável.
export class FilaDeTrabalho {
  private readonly largura: number;
  private rodando = 0;
  private readonly espera: Array<() => void> = [];

  constructor(largura: number) {
    this.largura = Math.max(1, Math.floor(largura));
  }

  get emAndamento(): number {
    return this.rodando;
  }

  get aguardando(): number {
    return this.espera.length;
  }

  async adicionar<T>(tarefa: () => Promise<T>): Promise<T> {
    if (this.rodando >= this.largura) {
      await new Promise<void>((liberar) => this.espera.push(liberar));
    }
    this.rodando += 1;
    try {
      return await tarefa();
    } finally {
      this.rodando -= 1;
      this.espera.shift()?.();
    }
  }
}
