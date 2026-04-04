import { useEffect } from 'react'

export function useMonument(name) {
  useEffect(() => {
    document.body.setAttribute('data-monument', name)
    return () => document.body.removeAttribute('data-monument')
  }, [name])
}
