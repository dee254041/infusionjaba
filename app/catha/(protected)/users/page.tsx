import { Header } from '@/components/layout/header'
import { CathaUsersClient } from './catha-users-client'

export default async function CathaUsersPage() {
  return (
    <>
      <Header title="User Management" />
      <div className="p-4 md:p-6">
        <CathaUsersClient initialUsers={[]} />
      </div>
    </>
  )
}
