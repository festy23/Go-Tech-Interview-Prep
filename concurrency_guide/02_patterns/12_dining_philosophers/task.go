/*
Задача: Конкурентный банк (Deadlock Prevention — Resource Ordering)

Условие:
- 5 аккаунтов с начальными балансами.
- 10 горутин делают случайные переводы между аккаунтами.
- Наивный подход lock(from), lock(to) приводит к DEADLOCK:
  горутина A лочит аккаунт 1, горутина B лочит аккаунт 2,
  затем A пытается залочить 2, а B пытается залочить 1 — взаимная блокировка.
- Решение: всегда лочить аккаунт с меньшим ID первым (resource ordering).
  Это тот же приём, что и в задаче обедающих философов.
- Инвариант: суммарный баланс всех аккаунтов не изменяется.
- 100 транзакций, вывести все и финальные балансы.
- Убедиться, что deadlock не произошёл.

Паттерн: resource ordering для предотвращения deadlock (аналог решения задачи обедающих философов).
*/

package main

import (
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"
)

// Account — банковский аккаунт с мьютексом для потокобезопасного доступа
type Account struct {
	ID      int
	mu      sync.Mutex
	balance int64
}

// Balance возвращает текущий баланс (потокобезопасно)
func (a *Account) Balance() int64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.balance
}

// Bank — банк с набором аккаунтов
type Bank struct {
	accounts []*Account
}

// NewBank создаёт банк с заданным количеством аккаунтов и начальным балансом
func NewBank(numAccounts int, initialBalance int64) *Bank {
	accounts := make([]*Account, numAccounts)
	for i := range accounts {
		accounts[i] = &Account{
			ID:      i,
			balance: initialBalance,
		}
	}
	return &Bank{accounts: accounts}
}

// Transfer выполняет перевод между двумя аккаунтами.
// Ключевой момент: мьютексы всегда захватываются в порядке возрастания ID,
// что гарантирует отсутствие deadlock.
func (b *Bank) Transfer(fromID, toID int, amount int64) (bool, string) {
	if fromID == toID {
		return false, "перевод на тот же аккаунт"
	}
	if fromID < 0 || fromID >= len(b.accounts) || toID < 0 || toID >= len(b.accounts) {
		return false, "неверный ID аккаунта"
	}

	from := b.accounts[fromID]
	to := b.accounts[toID]

	// === КЛЮЧЕВОЕ РЕШЕНИЕ: resource ordering ===
	// Всегда лочим аккаунт с меньшим ID первым.
	// Это предотвращает deadlock, потому что все горутины
	// захватывают мьютексы в одном и том же глобальном порядке.
	first, second := from, to
	if from.ID > to.ID {
		first, second = to, from
	}

	first.mu.Lock()
	second.mu.Lock()

	// Проверяем достаточность средств
	if from.balance < amount {
		second.mu.Unlock()
		first.mu.Unlock()
		return false, fmt.Sprintf("недостаточно средств: баланс %d, запрос %d", from.balance, amount)
	}

	// Выполняем перевод
	from.balance -= amount
	to.balance += amount

	second.mu.Unlock()
	first.mu.Unlock()

	return true, "успешно"
}

// TotalBalance возвращает суммарный баланс всех аккаунтов (для проверки инварианта)
func (b *Bank) TotalBalance() int64 {
	var total int64
	for _, acc := range b.accounts {
		total += acc.Balance()
	}
	return total
}

// PrintBalances выводит балансы всех аккаунтов
func (b *Bank) PrintBalances() {
	for _, acc := range b.accounts {
		fmt.Printf("  Аккаунт #%d: %d руб.\n", acc.ID, acc.Balance())
	}
}

func main() {
	fmt.Println("=== Конкурентный банк (предотвращение deadlock) ===\n")

	const (
		numAccounts    = 5
		numWorkers     = 10
		totalTransfers = 100
		initialBalance = 10000
	)

	bank := NewBank(numAccounts, initialBalance)

	// Проверяем начальное состояние
	expectedTotal := int64(numAccounts * initialBalance)
	fmt.Println("Начальные балансы:")
	bank.PrintBalances()
	fmt.Printf("Суммарный баланс: %d руб.\n\n", bank.TotalBalance())

	// Счётчики для статистики
	var successCount, failCount atomic.Int64
	var transfersDone atomic.Int64

	// Канал для распределения транзакций между воркерами
	transfers := make(chan int, totalTransfers)
	for i := 1; i <= totalTransfers; i++ {
		transfers <- i
	}
	close(transfers)

	// Мьютекс для последовательного вывода лога транзакций
	var logMu sync.Mutex

	fmt.Printf("Запускаем %d воркеров для %d транзакций...\n\n", numWorkers, totalTransfers)
	start := time.Now()

	var wg sync.WaitGroup
	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(workerID)))

			for txID := range transfers {
				// Случайные аккаунты отправителя и получателя
				fromID := rng.Intn(numAccounts)
				toID := rng.Intn(numAccounts)
				for toID == fromID {
					toID = rng.Intn(numAccounts)
				}
				// Случайная сумма перевода (100-2000)
				amount := int64(100 + rng.Intn(1900))

				ok, msg := bank.Transfer(fromID, toID, amount)
				done := transfersDone.Add(1)

				if ok {
					successCount.Add(1)
				} else {
					failCount.Add(1)
				}

				// Выводим каждую 10-ю транзакцию
				if done%10 == 0 || !ok {
					logMu.Lock()
					status := "OK"
					if !ok {
						status = "FAIL"
					}
					fmt.Printf("  [tx#%03d worker-%d] %d -> %d: %d руб. [%s] %s\n",
						txID, workerID, fromID, toID, amount, status, msg)
					logMu.Unlock()
				}
			}
		}(w)
	}

	// Ожидаем завершения всех воркеров
	wg.Wait()
	elapsed := time.Since(start)

	// --- Итоги ---
	fmt.Println("\n--- Итоги ---")
	fmt.Printf("Время выполнения: %v\n", elapsed.Round(time.Millisecond))
	fmt.Printf("Всего транзакций: %d\n", totalTransfers)
	fmt.Printf("  Успешных: %d\n", successCount.Load())
	fmt.Printf("  Неудачных: %d (недостаточно средств)\n\n", failCount.Load())

	fmt.Println("Финальные балансы:")
	bank.PrintBalances()

	finalTotal := bank.TotalBalance()
	fmt.Printf("\nСуммарный баланс: %d руб. (ожидалось: %d руб.)\n", finalTotal, expectedTotal)

	// Проверка инварианта
	if finalTotal == expectedTotal {
		fmt.Println("ИНВАРИАНТ СОБЛЮДЁН: суммарный баланс не изменился!")
	} else {
		fmt.Printf("ОШИБКА ИНВАРИАНТА: разница = %d руб.\n", finalTotal-expectedTotal)
	}

	fmt.Println("\nDEADLOCK НЕ ПРОИЗОШЁЛ: все 100 транзакций выполнены.")
	fmt.Println("Решение: resource ordering (захват мьютексов по возрастанию ID аккаунта).")
}
