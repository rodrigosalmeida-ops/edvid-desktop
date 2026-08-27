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
      // Quem acorda já recebe a vaga de quem saiu. A vaga é passada de mão em
      // mão para não existir uma janela de microtask em que uma nova tarefa
      // enxergue o contador zerado e fure o limite de concorrência.
      await new Promise<void>((liberar) => this.espera.push(liberar));
    } else {
      this.rodando += 1;
    }
    try {
      return await tarefa();
    } finally {
      const proximo = this.espera.shift();
      if (proximo) proximo();
      else this.rodando -= 1;
    }
  }
}
