import { useSearchParams } from 'react-router-dom'
import Auth from './Auth.jsx'

export default function Login({ title }) {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const urlTitle = searchParams.get('title')

  return <Auth mode="login" redirectPath={redirect} title={title || urlTitle} />
}
