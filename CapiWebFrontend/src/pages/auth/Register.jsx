import { useSearchParams } from 'react-router-dom'
import Auth from './Auth.jsx'

export default function Register({ title }) {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const urlTitle = searchParams.get('title')

  return <Auth mode="register" redirectPath={redirect} title={title || urlTitle} />
}
