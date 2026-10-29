/** Numeric priority queue shared by both routing graphs. */
export class MinHeap {
  private ids: number[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, priority: number): void {
    this.ids.push(id);
    this.priorities.push(priority);
    let index = this.ids.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.priorities[parent] <= this.priorities[index]) {
        break;
      }
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop() as number;
    const lastPriority = this.priorities.pop() as number;
    if (this.ids.length > 0) {
      this.ids[0] = lastId;
      this.priorities[0] = lastPriority;
      let index = 0;
      // Each iteration descends one level of the finite binary heap.
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (
          left < this.ids.length &&
          this.priorities[left] < this.priorities[smallest]
        ) {
          smallest = left;
        }
        if (
          right < this.ids.length &&
          this.priorities[right] < this.priorities[smallest]
        ) {
          smallest = right;
        }
        if (smallest === index) {
          break;
        }
        this.swap(index, smallest);
        index = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.priorities[a], this.priorities[b]] = [
      this.priorities[b],
      this.priorities[a],
    ];
  }
}
